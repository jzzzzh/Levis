//! Image jobs found again after a restart, and the prompt an inserted
//! image was generated from.

use super::*;

pub(super) fn recover_registry(app: &AppHandle) -> Result<(), MediaError> {
    if RECOVERED.load(Ordering::SeqCst) {
        return Ok(());
    }
    let _guard = RECOVERY_LOCK.lock().unwrap();
    if RECOVERED.load(Ordering::SeqCst) {
        return Ok(());
    }
    let dir = directory(app)?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json")
                || std::fs::metadata(&path)
                    .map(|m| m.len() > 65536)
                    .unwrap_or(true)
            {
                continue;
            }
            let Some(mut job) = std::fs::read(&path)
                .ok()
                .and_then(|r| serde_json::from_slice::<ImageJob>(&r).ok())
            else {
                continue;
            };
            if !valid_id(&job.job_id)
                || !valid_id(&job.task_id)
                || !valid_id(&job.document_id)
                || path.file_stem().and_then(|s| s.to_str()) != Some(job.job_id.as_str())
            {
                continue;
            }
            if let Some(preview) = job.preview_path.as_ref() {
                let preview = PathBuf::from(preview);
                if preview.parent() != Some(dir.as_path())
                    || preview.file_stem().and_then(|s| s.to_str()) != Some(job.job_id.as_str())
                    || !matches!(
                        preview.extension().and_then(|s| s.to_str()),
                        Some("png" | "jpg" | "webp")
                    )
                {
                    continue;
                }
            }
            job.prepared_path = None;
            if matches!(job.status.as_str(), "prepared" | "preparing") {
                job.status = "failed".into();
                job.error = Some(
                    "Image insertion was interrupted. Verify the document before retrying.".into(),
                );
            }
            if matches!(job.status.as_str(), "queued" | "running") {
                job.status = "failed".into();
                job.error = Some("Image generation was interrupted. Retry explicitly.".into());
            }
            if job.status == "ready"
                && job
                    .preview_path
                    .as_ref()
                    .is_none_or(|p| !std::path::Path::new(p).is_file())
            {
                job.status = "failed".into();
                job.error =
                    Some("Generated image is no longer available. Retry explicitly.".into());
            }
            let mut registry = REGISTRY.lock().unwrap();
            if !registry.jobs.contains_key(&job.job_id) {
                let key = format!("{}/{}", job.document_id, job.task_id);
                let count = registry.counts.entry(key).or_default();
                *count = (*count).max(job.sequence);
                registry.jobs.insert(job.job_id.clone(), job);
            }
        }
    }
    RECOVERED.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn media_image_jobs(
    app: AppHandle,
    document_id: String,
) -> Result<Vec<ImageJob>, MediaError> {
    if !valid_id(&document_id) {
        return Err(MediaError::new(
            "invalid_request",
            "Invalid document identity",
        ));
    }
    recover_registry(&app)?;
    let mut jobs: Vec<_> = REGISTRY
        .lock()
        .unwrap()
        .jobs
        .values()
        .filter(|j| j.document_id == document_id)
        .cloned()
        .collect();
    jobs.sort_by(|a, b| a.task_id.cmp(&b.task_id).then(a.sequence.cmp(&b.sequence)));
    Ok(jobs)
}

/// The prompt an inserted image was generated from, found by the asset's file
/// name (stable across Save As migration, which only changes its folder).
/// None for images Textus did not generate.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePromptInfo {
    prompt: String,
    model: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

pub(super) fn asset_name(src: &str) -> Option<&str> {
    src.rsplit(['/', '\\'])
        .next()
        .filter(|name| name.starts_with("image-") && !name.contains(".."))
}

/// `image-<time>-<pid>-<n>`: the generated part of a name, without the
/// extension or the "-1", "-2"… a Save As collision appends.
pub(super) fn generated_stem(name: &str) -> String {
    let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
    stem.split('-').take(4).collect::<Vec<_>>().join("-")
}

#[tauri::command]
pub async fn media_image_prompt(
    app: AppHandle,
    src: String,
) -> Result<Option<ImagePromptInfo>, MediaError> {
    recover_registry(&app)?;
    let decoded = percent_decode(&src);
    let Some(name) = asset_name(&decoded) else {
        return Ok(None);
    };
    let registry = REGISTRY.lock().unwrap();
    Ok(registry
        .jobs
        .values()
        .filter(|job| job.status == "committed")
        .find(|job| {
            job.asset_src
                .as_deref()
                .map(percent_decode)
                .as_deref()
                .and_then(asset_name)
                == Some(name)
        })
        .or_else(|| {
            // Copied under a collision name the job never heard about.
            let wanted = generated_stem(name);
            registry
                .jobs
                .values()
                .filter(|job| job.status == "committed")
                .find(|job| {
                    job.asset_src
                        .as_deref()
                        .map(percent_decode)
                        .as_deref()
                        .and_then(asset_name)
                        .map(generated_stem)
                        .as_deref()
                        == Some(wanted.as_str())
                })
        })
        .map(|job| ImagePromptInfo {
            prompt: job.request.prompt.clone(),
            model: job.model.clone(),
            width: job.width,
            height: job.height,
        }))
}

/// Markdown image destinations are percent-encoded; file names are compared
/// decoded.
pub(super) fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(byte) = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
            {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
