//! Levis: the project folder as the auto-writing file tree sees it - every
//! file with what it is - and which folder that is. The walk, the kinds and
//! the safety rules are ai::project's; this only lists.

use crate::ai::project::{file_kind, FileKind};
use serde::Serialize;
use std::path::Path;

/// Most files the tree lists: a folder of writing is far below it.
const MAX_LISTED: usize = 2000;

/// One file of the project folder. Mirrors `ProjectEntry` in platform/ipc.ts.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ProjectEntry {
    /// Relative to the project folder, `/`-separated.
    pub path: String,
    /// "text", "document" (Word, PDF, slides, sheets...), "image" or "other".
    pub kind: &'static str,
    pub bytes: u64,
}

/// What a project file is to a writer.
fn entry_kind(path: &Path) -> &'static str {
    match file_kind(path) {
        Some(FileKind::Text) => "text",
        Some(FileKind::Document) => "document",
        Some(FileKind::Image) => "image",
        // Pictures a document shows that no model is sent.
        None if matches!(
            crate::extract::extension_of(path).as_str(),
            "svg" | "bmp" | "avif"
        ) =>
        {
            "image"
        }
        None => "other",
    }
}

/// Every file under `root`, of any kind, hidden and skipped entries left out.
pub fn walk_entries(root: &Path) -> Vec<ProjectEntry> {
    crate::walk::walk(root, &crate::walk::LIMITS, |_| true)
        .files
        .into_iter()
        .take(MAX_LISTED)
        .map(|file| ProjectEntry {
            kind: entry_kind(&file.path),
            bytes: std::fs::metadata(&file.path).map_or(0, |m| m.len()),
            path: file.rel,
        })
        .collect()
}

/// Every file of the project, with its kind - the auto-writing file tree.
#[tauri::command]
pub async fn list_project_entries(
    doc_path: Option<String>,
    workspace_root: Option<String>,
) -> Vec<ProjectEntry> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::ai::workspace::project_root(doc_path.as_deref(), workspace_root.as_deref())
            .map(|root| walk_entries(&root))
            .unwrap_or_default()
    })
    .await
    .unwrap_or_default()
}

/// The project folder in use (explicit, or the document's own folder), for
/// showing which one it is.
#[tauri::command]
pub fn project_folder(doc_path: Option<String>, workspace_root: Option<String>) -> Option<String> {
    crate::ai::workspace::project_root(doc_path.as_deref(), workspace_root.as_deref())
        .map(|root| root.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_listing_holds_every_kind_of_file_but_hidden_ones() {
        let dir = tempfile::tempdir().unwrap();
        for (rel, bytes) in [
            ("大纲.md", &b"# outline"[..]),
            ("资料/人物.docx", b"not really a zip"),
            ("图片/封面 1.jpg", b"jpg"),
            ("misc.bin", b"x"),
            (".secret/key.txt", b"no"),
        ] {
            let path = dir.path().join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, bytes).unwrap();
        }
        let mut kinds: Vec<(String, &str)> = walk_entries(dir.path())
            .into_iter()
            .map(|e| (e.path, e.kind))
            .collect();
        kinds.sort();
        assert_eq!(
            kinds,
            [
                ("misc.bin".to_string(), "other"),
                ("图片/封面 1.jpg".to_string(), "image"),
                ("大纲.md".to_string(), "text"),
                ("资料/人物.docx".to_string(), "document"),
            ]
        );
    }
}
