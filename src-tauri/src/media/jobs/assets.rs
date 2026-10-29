//! An image job's way into the document: prepared as a document asset,
//! then committed or rolled back, and moved along with Save As.

use super::*;

#[derive(Deserialize)]
pub struct ImageAssetMapping {
    old: String,
    new: String,
}

#[tauri::command]
pub async fn media_rebase_image_assets(
    app: AppHandle,
    document_id: String,
    mappings: Vec<ImageAssetMapping>,
) -> Result<(), MediaError> {
    let _commit = COMMIT_LOCK.lock().await;
    let changed = {
        let mut registry = REGISTRY.lock().unwrap();
        let mut changed = Vec::new();
        for job in registry
            .jobs
            .values_mut()
            .filter(|job| job.document_id == document_id)
        {
            if let Some(mapping) = mappings
                .iter()
                .find(|mapping| job.asset_src.as_deref() == Some(mapping.old.as_str()))
            {
                job.asset_src = Some(mapping.new.clone());
                changed.push(job.clone());
            }
        }
        changed
    };
    for job in changed {
        write_metadata(&app, &job).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn media_cancel_image(app: AppHandle, job_id: String) -> Result<(), MediaError> {
    let _commit = COMMIT_LOCK.lock().await;
    let mut job = get_job(&job_id)?;
    if matches!(job.status.as_str(), "committed" | "prepared" | "preparing") {
        return Err(MediaError::new(
            "conflict",
            "A committed or committing image cannot be cancelled",
        ));
    }
    job.status = "cancelled".into();
    store(job.clone());
    provider::media_cancel(job_id.clone());
    if let Some(ref path) = job.preview_path {
        let _ = tokio::fs::remove_file(path).await;
    }
    job.preview_path = None;
    store(job.clone());
    write_metadata(&app, &job).await?;
    Ok(())
}

#[tauri::command]
pub async fn media_prepare_image(
    app: AppHandle,
    job_id: String,
    doc_path: Option<String>,
    // The image folder setting (commands::fs::ImageFolder); None, from an
    // older frontend, is the document's `assets/` folder.
    folder: Option<String>,
) -> Result<String, MediaError> {
    let _commit = COMMIT_LOCK.lock().await;
    use base64::Engine;
    let mut job = {
        let mut registry = REGISTRY.lock().unwrap();
        let job = registry
            .jobs
            .get_mut(&job_id)
            .ok_or_else(|| MediaError::new("not_found", "Image job no longer exists"))?;
        if job.status != "ready" {
            return Err(MediaError::new(
                "conflict",
                "This image is not ready to insert",
            ));
        }
        job.status = "preparing".into();
        job.clone()
    };
    let result = async {
        let path = job
            .preview_path
            .as_ref()
            .ok_or_else(|| MediaError::new("storage", "Image preview is missing"))?;
        let bytes = tokio::fs::read(path)
            .await
            .map_err(|_| MediaError::new("storage", "Image preview no longer exists"))?;
        let (ext, _, _) = image::validate_image(&bytes)?;
        let saved = crate::commands::fs::save_pasted_image(
            app.clone(),
            doc_path.clone(),
            base64::engine::general_purpose::STANDARD.encode(bytes),
            ext.into(),
            folder.unwrap_or_else(|| "assets".into()),
        )
        .await
        .map_err(|_| MediaError::new("storage", "Cannot save image through document assets"))?;
        let path = if std::path::Path::new(&saved.src).is_absolute() {
            PathBuf::from(&saved.src)
        } else {
            PathBuf::from(doc_path.as_ref().unwrap())
                .parent()
                .unwrap()
                .join(&saved.src)
        };
        job.asset_src = Some(saved.src.clone());
        job.prepared_path = Some(path.to_string_lossy().into_owned());
        job.status = "prepared".into();
        if let Err(error) = write_metadata(&app, &job).await {
            let _ = tokio::fs::remove_file(&path).await;
            return Err(error);
        }
        store(job.clone());
        Ok(saved.src)
    }
    .await;
    if result.is_err() {
        job.status = "ready".into();
        store(job);
    }
    result
}

#[tauri::command]
pub async fn media_finish_image(
    app: AppHandle,
    job_id: String,
    accepted: bool,
) -> Result<(), MediaError> {
    let _commit = COMMIT_LOCK.lock().await;
    let mut job = get_job(&job_id)?;
    if job.status != "prepared" {
        return Err(MediaError::new(
            "conflict",
            "Image has no prepared document asset",
        ));
    }
    if accepted {
        job.status = "committed".into();
        store(job.clone());
        // Keep generation metadata, but never remove an accepted image on Undo.
        write_metadata(&app, &job).await?;
        if let Some(path) = job.preview_path.take() {
            let _ = tokio::fs::remove_file(path).await;
        }
        job.prepared_path = None;
    } else {
        if let Some(path) = job.prepared_path.take() {
            tokio::fs::remove_file(path)
                .await
                .map_err(|_| MediaError::new("storage", "Cannot roll back prepared image asset"))?;
        }
        job.asset_src = None;
        job.status = "ready".into();
        write_metadata(&app, &job).await?;
    }
    store(job);
    Ok(())
}
