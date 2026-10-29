//! Levis: the external agent engines (the bundled DeepSeek Harness, the
//! Codex and Claude Code CLIs) behind ai_agent_message's `engine`. A thin
//! process boundary: official engines own execution; Textus owns review.
use super::{
    agent::{AgentMode, StreamEvent},
    cancel, catalog, route,
};
use aicompat::agent::{AgentTurn, ImageAttachment};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{ipc::Channel, AppHandle, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
};

fn executable(name: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    let mut candidates = vec![
        home.join(".local/bin").join(name),
        PathBuf::from("/opt/homebrew/bin").join(name),
        PathBuf::from("/usr/local/bin").join(name),
    ];
    if name == "codex" {
        candidates.insert(0, PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"));
        candidates.insert(
            0,
            PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
        );
    }
    if let Some(paths) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&paths).map(|p| p.join(name)));
    }
    candidates.into_iter().find(|p| p.is_file())
}
struct ProcessGuard {
    pid: Option<u32>,
    home: PathBuf,
}
impl Drop for ProcessGuard {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.pid {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
        #[cfg(windows)]
        if let Some(pid) = self.pid {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
        let _ = std::fs::remove_dir_all(&self.home);
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn run(
    app: AppHandle,
    engine: String,
    engine_model: Option<String>,
    provider: String,
    document: String,
    history: Vec<AgentTurn>,
    message: String,
    images: Vec<ImageAttachment>,
    mode: AgentMode,
    model: Option<String>,
    request_id: String,
    image_task: Option<crate::media::jobs::ImageTaskPermission>,
    channel: Channel<StreamEvent>,
) -> Result<Vec<AgentTurn>, String> {
    let mode = engine_mode(mode).to_string();
    if !["harness", "codex", "claude-code"].contains(&engine.as_str()) {
        return Err("Unknown agent engine".into());
    }
    if !images.is_empty() {
        return Err("This engine's document bridge currently accepts text attachments. Remove image attachments before sending.".into());
    }
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../harness");
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("harness");
    let root = if bundled.join("host.mjs").is_file() {
        bundled
    } else if cfg!(debug_assertions) {
        source
    } else {
        return Err("Agent runtime resources are missing. Reinstall Textus.".into());
    };
    let node = if root
        .join(if cfg!(windows) { "node.exe" } else { "node" })
        .is_file()
    {
        root.join(if cfg!(windows) { "node.exe" } else { "node" })
    } else {
        executable("node")
            .ok_or("Node runtime is missing; rebuild Textus with its bundled runtime.")?
    };
    let home = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("agent-runs")
        .join(&request_id);
    // Request IDs are minted by the frontend, but never trust them as paths.
    if request_id.len() > 80
        || !request_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid request id".into());
    }
    let mut request = json!({"engine":engine,"engineModel":engine_model,"document":document,"history":history,"message":message,"mode":mode,"home":home});
    if engine == "harness" {
        let entry = catalog::find(&provider).ok_or("Unknown provider")?;
        if entry.dialect != "openai-chat-completions" {
            return Err("DeepSeek Harness currently requires an OpenAI-compatible provider. Select MiniMax / Custom Endpoint in Settings.".into());
        }
        let (url, key, default_model) = route::resolve_chat_completions(&app, entry).await?;
        request["baseUrl"] = json!(url);
        request["apiKey"] = json!(key);
        request["model"] = json!(model
            .or(default_model)
            .ok_or("Select a model in Settings")?);
    } else {
        request["executable"] =
            json!(
                executable(if engine == "codex" { "codex" } else { "claude" }).ok_or_else(
                    || format!(
                        "{engine} is not installed. Install its official CLI and sign in first."
                    )
                )?
            );
    }
    let image_context = image_task
        .filter(|p| p.allow_automatic && ["create", "edit"].contains(&mode.as_str()))
        .map(|permission| crate::media::jobs::ImageTaskContext {
            app: app.clone(),
            permission,
            mode: mode.clone(),
        });
    request["enableImages"] = json!(image_context.is_some());
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&home, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let timed = async {
        tokio::time::timeout(
            std::time::Duration::from_secs(600),
            run_process(node, root, request, home, image_context, channel),
        )
        .await
        .unwrap_or_else(|_| Err("Agent request timed out after ten minutes.".into()))
    };
    cancel::cancellable(request_id, timed).await
}

/// The engines' names for the panel's modes: they write in "edit" and
/// "create" (a whole document as section proposals), and only read in "ask".
fn engine_mode(mode: AgentMode) -> &'static str {
    match mode {
        AgentMode::Write => "edit",
        AgentMode::Review => "ask",
        AgentMode::Create => "create",
    }
}

/// A runtime event as the frontend's StreamEvent; None for one it doesn't show.
fn stream_event(event: &Value) -> Option<StreamEvent> {
    let text = || {
        event
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    match event.get("type").and_then(Value::as_str)? {
        "turn" => serde_json::from_value(event.get("turn")?.clone())
            .ok()
            .map(|turn| StreamEvent::Turn { turn }),
        "delta" => text().map(|text| StreamEvent::Delta { text }),
        "thinking" => text().map(|text| StreamEvent::Thinking { text }),
        "retry" => Some(StreamEvent::Retry),
        _ => None,
    }
}

async fn run_process(
    node: PathBuf,
    root: PathBuf,
    request: Value,
    home: PathBuf,
    image_context: Option<crate::media::jobs::ImageTaskContext>,
    channel: Channel<StreamEvent>,
) -> Result<Vec<AgentTurn>, String> {
    let mut cmd = Command::new(node);
    let mut paths = vec![root.clone()];
    if let Some(path) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&path));
    }
    if let Ok(path) = std::env::join_paths(paths) {
        cmd.env("PATH", path);
    }
    cmd.arg(root.join("host.mjs"))
        .current_dir(&root)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.as_std_mut().process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| {
        let _ = std::fs::remove_dir_all(&home);
        format!("Cannot start agent runtime: {e}")
    })?;
    let mut guard = ProcessGuard {
        pid: child.id(),
        home,
    };
    let mut stdin = child.stdin.take().ok_or("Missing agent input")?;
    stdin
        .write_all(format!("{}\n", request).as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    let mut lines = BufReader::new(child.stdout.take().ok_or("Missing agent output")?).lines();
    let mut result = None;
    while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
        let value: Value = serde_json::from_str(&line).map_err(|_| "Invalid runtime protocol")?;
        if let Some(error) = value.get("error").and_then(Value::as_str) {
            return Err(error.to_string());
        }
        if let Some(tool) = value.get("tool") {
            let output = if tool["name"] == "generate_image" {
                match (
                    &image_context,
                    tool["arguments"]
                        .as_str()
                        .and_then(|s| serde_json::from_str(s).ok()),
                ) {
                    (Some(context), Some(args)) => {
                        match crate::media::jobs::start_job(context, args) {
                            Ok(job) => serde_json::to_string(&job).unwrap_or_default(),
                            Err(e) => format!("Image not generated: {}", e.message),
                        }
                    }
                    _ => "Image generation denied: no task authorization.".to_string(),
                }
            } else {
                "Unknown tool".to_string()
            };
            stdin
                .write_all(format!("{}\n", json!({"id":tool["id"],"output":output})).as_bytes())
                .await
                .map_err(|e| e.to_string())?;
        }
        if let Some(event) = value.get("event").and_then(stream_event) {
            let _ = channel.send(event);
        }
        if let Some(turns) = value.get("result") {
            result = Some(serde_json::from_value(turns.clone()).map_err(|e| e.to_string())?);
        }
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    guard.pid = None;
    if !status.success() {
        return Err("Agent runtime exited unexpectedly. Check its installation and login.".into());
    }
    result.ok_or("Agent runtime returned no result".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_turns_reach_the_panel_as_stream_events() {
        let turn = json!({"type": "turn", "turn": {"kind": "Assistant", "text": "done"}});
        assert!(matches!(
            stream_event(&turn),
            Some(StreamEvent::Turn { turn: AgentTurn::Assistant { text, .. } }) if text == "done"
        ));
        assert!(stream_event(&json!({"type": "unknown"})).is_none());
        assert_eq!(engine_mode(AgentMode::Write), "edit");
        assert_eq!(engine_mode(AgentMode::Review), "ask");
    }
}
