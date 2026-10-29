//! Levis: crash-safe snapshots of an auto-writing workspace (its draft
//! proposals over a document), one per document, beside the tab drafts of
//! commands::drafts. Cleared with them (clear_all_drafts).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use tokio::fs;

/// Document ids become a path component, so only ASCII letters, digits and
/// '-' pass (as commands::drafts does for tab ids).
fn valid_component(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Removes every workspace snapshot - clear_all_drafts' hook.
pub async fn clear_all(app: &AppHandle) -> Result<(), String> {
    match fs::remove_dir_all(workspace_dir(app)?).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Mirrors platform/ipc.ts. Draft proposals are validated again by the editor
/// against the live revision; this store never writes a document.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    schema_version: u32,
    document_id: String,
    #[serde(default)]
    tab_id: Option<String>,
    document_path: Option<String>,
    updated_at: u64,
    status: String,
    draft: serde_json::Value,
}

const MAX_WORKSPACE_BYTES: u64 = 8 * 1024 * 1024;
static WORKSPACES_CLAIMED: AtomicBool = AtomicBool::new(false);

fn workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("workspace-drafts"))
        .map_err(|e| e.to_string())
}

fn validate_workspace(snapshot: &WorkspaceSnapshot) -> Result<(), String> {
    if snapshot.schema_version != 1
        || !valid_component(&snapshot.document_id)
        || !matches!(
            snapshot.status.as_str(),
            "running" | "review" | "interrupted"
        )
        || snapshot.draft.get("documentId").and_then(|s| s.as_str())
            != Some(snapshot.document_id.as_str())
        || snapshot
            .draft
            .get("baseMarkdown")
            .and_then(|s| s.as_str())
            .is_none()
        || snapshot
            .draft
            .get("operations")
            .and_then(|s| s.as_array())
            .is_none()
    {
        return Err("invalid workspace snapshot".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn save_workspace_snapshot(
    app: AppHandle,
    snapshot: WorkspaceSnapshot,
) -> Result<(), String> {
    validate_workspace(&snapshot)?;
    let bytes = serde_json::to_vec(&snapshot).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_WORKSPACE_BYTES {
        return Err("workspace snapshot too large".into());
    }
    let dir = workspace_dir(&app)?;
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    crate::atomic::write(&dir.join(format!("{}.json", snapshot.document_id)), bytes)
        .await
        .map_err(|e| e.to_string())
}

async fn read_workspace(path: PathBuf) -> Option<WorkspaceSnapshot> {
    if fs::metadata(&path).await.ok()?.len() > MAX_WORKSPACE_BYTES {
        return None;
    }
    let raw = fs::read(path).await.ok()?;
    let snapshot: WorkspaceSnapshot = serde_json::from_slice(&raw).ok()?;
    validate_workspace(&snapshot).ok()?;
    Some(snapshot)
}

#[tauri::command]
pub async fn load_workspace_snapshot(
    app: AppHandle,
    document_id: String,
) -> Result<Option<WorkspaceSnapshot>, String> {
    if !valid_component(&document_id) {
        return Err("invalid document id".into());
    }
    Ok(read_workspace(workspace_dir(&app)?.join(format!("{document_id}.json"))).await)
}

#[tauri::command]
pub async fn clear_workspace_snapshot(app: AppHandle, document_id: String) -> Result<(), String> {
    if !valid_component(&document_id) {
        return Err("invalid document id".into());
    }
    match fs::remove_file(workspace_dir(&app)?.join(format!("{document_id}.json"))).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn take_workspace_snapshots(
    app: AppHandle,
    window: tauri::Window,
) -> Result<Vec<WorkspaceSnapshot>, String> {
    if window.label() != "main" || WORKSPACES_CLAIMED.swap(true, Ordering::SeqCst) {
        return Ok(vec![]);
    }
    let mut entries = match fs::read_dir(workspace_dir(&app)?).await {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    let mut recovered = vec![];
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Some(mut snapshot) = read_workspace(entry.path()).await {
            if snapshot.status == "running" {
                snapshot.status = "interrupted".into();
            }
            recovered.push(snapshot);
        }
    }
    Ok(recovered)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_schema_identity_and_safe_paths() {
        let mut snapshot = WorkspaceSnapshot {
            schema_version: 1,
            document_id: "doc-1".into(),
            tab_id: None,
            document_path: None,
            updated_at: 0,
            status: "running".into(),
            draft: serde_json::json!({"documentId":"doc-1", "baseMarkdown":"", "operations":[]}),
        };
        assert!(validate_workspace(&snapshot).is_ok());
        snapshot.schema_version = 2;
        assert!(validate_workspace(&snapshot).is_err());
        snapshot.schema_version = 1;
        snapshot.document_id = "../escape".into();
        assert!(validate_workspace(&snapshot).is_err());
    }
}
