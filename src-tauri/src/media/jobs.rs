use super::{
    image,
    provider::{self, MediaError},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        LazyLock, Mutex,
    },
};
use tauri::{AppHandle, Manager};

/// Supplied by the UI, outside model-controlled tool arguments. Mirrors ipc.ts.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageTaskPermission {
    pub generation_id: String,
    pub task_id: String,
    pub document_id: String,
    pub base_revision: u64,
    pub allow_automatic: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRequest {
    pub prompt: String,
    pub anchor: String,
    pub alt: String,
    pub caption: Option<String>,
    pub size: Option<String>,
    pub quality: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageJob {
    #[serde(default)]
    pub generation_id: String,
    pub job_id: String,
    pub task_id: String,
    pub document_id: String,
    pub base_revision: u64,
    pub sequence: usize,
    pub request: ImageRequest,
    pub status: String,
    pub preview_path: Option<String>,
    pub error: Option<String>,
    pub model: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub asset_src: Option<String>,
    #[serde(skip)]
    prepared_path: Option<String>,
}

#[derive(Default)]
struct Registry {
    stopped: HashSet<String>,
    jobs: HashMap<String, ImageJob>,
    counts: HashMap<String, usize>,
    /// Image requests per send (generation): the cap the model works within.
    /// `counts` stays per task - it numbers the task's jobs.
    per_generation: HashMap<String, usize>,
}
static REGISTRY: LazyLock<Mutex<Registry>> = LazyLock::new(|| Mutex::new(Registry::default()));
static LANE: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);
static COMMIT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
static RECOVERED: AtomicBool = AtomicBool::new(false);
static RECOVERY_LOCK: Mutex<()> = Mutex::new(());

pub struct ImageTaskContext {
    pub app: AppHandle,
    pub permission: ImageTaskPermission,
    pub mode: String,
}
impl ImageTaskContext {
    pub fn allowed(&self) -> bool {
        self.permission.allow_automatic && matches!(self.mode.as_str(), "create" | "edit")
    }
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn generation_key(permission: &ImageTaskPermission) -> String {
    format!(
        "{}/{}/{}",
        permission.document_id, permission.task_id, permission.generation_id
    )
}
fn generation_active(
    registry: &Registry,
    permission: &ImageTaskPermission,
) -> Result<(), MediaError> {
    if !valid_id(&permission.generation_id)
        || registry.stopped.contains(&generation_key(permission))
    {
        return Err(MediaError::new(
            "cancelled",
            "This image request was stopped. Send a new request explicitly.",
        ));
    }
    Ok(())
}
fn stop_generation(registry: &mut Registry, permission: &ImageTaskPermission) -> Vec<ImageJob> {
    registry.stopped.insert(generation_key(permission));
    let mut cancelled = Vec::new();
    for job in registry.jobs.values_mut() {
        if job.document_id == permission.document_id
            && job.task_id == permission.task_id
            && job.generation_id == permission.generation_id
            && matches!(job.status.as_str(), "queued" | "running")
        {
            job.status = "cancelled".into();
            cancelled.push(job.clone());
        }
    }
    cancelled
}

#[tauri::command]
pub async fn media_cancel_image_generation(
    app: AppHandle,
    permission: ImageTaskPermission,
) -> Result<(), MediaError> {
    if !valid_id(&permission.task_id)
        || !valid_id(&permission.document_id)
        || !valid_id(&permission.generation_id)
    {
        return Err(MediaError::new(
            "invalid_request",
            "Invalid image generation identity",
        ));
    }
    let cancelled = stop_generation(&mut REGISTRY.lock().unwrap(), &permission);
    for job in cancelled {
        provider::media_cancel(job.job_id.clone());
        if let Some(path) = &job.preview_path {
            let _ = tokio::fs::remove_file(path).await;
        }
        write_metadata(&app, &job).await?;
    }
    Ok(())
}
/// Two image requests per send, retries included: each send is authorized
/// on its own (the composer's image switch resets after every request), so
/// a long conversation - or an auto-writing run, one send per section - is
/// not cut off after its first two pictures. Returns the job's number within
/// its task.
fn reserve(
    counts: &mut HashMap<String, usize>,
    per_generation: &mut HashMap<String, usize>,
    permission: &ImageTaskPermission,
) -> Result<usize, MediaError> {
    if !permission.allow_automatic
        || !valid_id(&permission.task_id)
        || !valid_id(&permission.document_id)
    {
        return Err(MediaError::new(
            "permission",
            "Image generation is not authorized for this task",
        ));
    }
    let used = per_generation
        .entry(generation_key(permission))
        .or_default();
    if *used >= 2 {
        return Err(MediaError::new(
            "limit",
            "This request has reached its two image-request limit",
        ));
    }
    *used += 1;
    let key = format!("{}/{}", permission.document_id, permission.task_id);
    let count = counts.entry(key).or_default();
    *count += 1;
    Ok(*count)
}
fn directory(app: &AppHandle) -> Result<PathBuf, MediaError> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("media-jobs"))
        .map_err(|_| MediaError::new("storage", "Cannot locate image job directory"))
}
async fn write_metadata(app: &AppHandle, job: &ImageJob) -> Result<(), MediaError> {
    let dir = directory(app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|_| MediaError::new("storage", "Cannot create image job directory"))?;
    let raw = serde_json::to_vec(job)
        .map_err(|_| MediaError::new("storage", "Cannot serialize image job"))?;
    crate::atomic::write(&dir.join(format!("{}.json", job.job_id)), raw)
        .await
        .map_err(|_| MediaError::new("storage", "Cannot save image job metadata"))
}
fn get_job(id: &str) -> Result<ImageJob, MediaError> {
    REGISTRY
        .lock()
        .unwrap()
        .jobs
        .get(id)
        .cloned()
        .ok_or_else(|| MediaError::new("not_found", "Image job no longer exists"))
}
fn store(job: ImageJob) {
    REGISTRY
        .lock()
        .unwrap()
        .jobs
        .insert(job.job_id.clone(), job);
}

/// Returns immediately. The synchronous Agent tool can enqueue without
/// holding up text generation; only the background job waits on the network.
pub fn start_job(
    context: &ImageTaskContext,
    request: ImageRequest,
) -> Result<ImageJob, MediaError> {
    if !context.allowed() {
        return Err(MediaError::new(
            "permission",
            "Ask/Plan cannot generate images; enable image generation for this task",
        ));
    }
    if request.anchor.trim().is_empty()
        || request.anchor.len() > 12000
        || request.prompt.trim().is_empty()
        || request.prompt.chars().count() > 12000
        || request.alt.len() > 2000
        || request.caption.as_ref().is_some_and(|c| c.len() > 4000)
    {
        return Err(MediaError::new(
            "invalid_request",
            "Specify a prompt, a stable section quote, and concise alternative text",
        ));
    }
    // Check configuration before consuming a task's request allowance.
    let _configured = provider::request(&context.app, "image", "images/generations")?;
    recover_registry(&context.app)?;
    let mut registry = REGISTRY.lock().unwrap();
    generation_active(&registry, &context.permission)?;
    let sequence = {
        let Registry {
            counts,
            per_generation,
            ..
        } = &mut *registry;
        reserve(counts, per_generation, &context.permission)?
    };
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let job_id = format!(
        "image-{timestamp}-{}",
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let job = ImageJob {
        generation_id: context.permission.generation_id.clone(),
        job_id: job_id.clone(),
        task_id: context.permission.task_id.clone(),
        document_id: context.permission.document_id.clone(),
        base_revision: context.permission.base_revision,
        sequence,
        request,
        status: "queued".into(),
        preview_path: None,
        error: None,
        model: None,
        width: None,
        height: None,
        asset_src: None,
        prepared_path: None,
    };
    registry.jobs.insert(job_id.clone(), job.clone());
    drop(registry);
    let app = context.app.clone();
    tauri::async_runtime::spawn(async move {
        run_job(app, job_id).await;
    });
    Ok(job)
}

async fn run_job(app: AppHandle, id: String) {
    let Ok(job) = get_job(&id) else {
        return;
    };
    let result = async {
        write_metadata(&app, &job).await?;
        let generated = provider::cancellable(&id, 180, async {
            let _permit = LANE
                .acquire()
                .await
                .map_err(|_| MediaError::new("cancelled", "Image queue stopped"))?;
            {
                let mut registry = REGISTRY.lock().unwrap();
                let running = registry.jobs.get_mut(&id).unwrap();
                if running.status != "queued" {
                    return Err(MediaError::new("cancelled", "Image job cancelled"));
                }
                running.status = "running".into();
            }
            image::generate(
                &app,
                &job.request.prompt,
                job.request.size.as_deref().unwrap_or("1024x1024"),
                job.request.quality.as_deref(),
            )
            .await
        })
        .await?;
        if get_job(&id)?.status == "cancelled" {
            return Err(MediaError::new("cancelled", "Image job cancelled"));
        }
        let path = directory(&app)?.join(format!("{id}.{}", generated.ext));
        {
            let mut registry = REGISTRY.lock().unwrap();
            let writing = registry.jobs.get_mut(&id).unwrap();
            if writing.status == "cancelled" {
                return Err(MediaError::new("cancelled", "Image job cancelled"));
            }
            writing.preview_path = Some(path.to_string_lossy().into_owned());
        }
        crate::atomic::write(&path, generated.bytes)
            .await
            .map_err(|_| MediaError::new("storage", "Cannot save generated image"))?;
        if get_job(&id)?.status == "cancelled" {
            let _ = tokio::fs::remove_file(&path).await;
            return Err(MediaError::new("cancelled", "Image job cancelled"));
        }
        let mut ready = get_job(&id)?;
        ready.status = "ready".into();
        ready.preview_path = Some(path.to_string_lossy().into_owned());
        ready.model = Some(generated.model);
        ready.width = Some(generated.width);
        ready.height = Some(generated.height);
        write_metadata(&app, &ready).await?;
        // Cancellation may have arrived during the atomic metadata write.
        let published = {
            let mut registry = REGISTRY.lock().unwrap();
            let current = registry.jobs.get_mut(&id).unwrap();
            if current.status != "running" {
                false
            } else {
                *current = ready;
                true
            }
        };
        if !published {
            let _ = tokio::fs::remove_file(&path).await;
            return Err(MediaError::new("cancelled", "Image job cancelled"));
        }
        Ok::<(), MediaError>(())
    }
    .await;
    if let Err(error) = result {
        if let Ok(mut failed) = get_job(&id) {
            failed.status = if error.code == "cancelled" || failed.status == "cancelled" {
                "cancelled"
            } else {
                "failed"
            }
            .into();
            failed.error = Some(error.message);
            if let Some(path) = failed.preview_path.take() {
                let _ = tokio::fs::remove_file(path).await;
            }
            store(failed.clone());
            let _ = write_metadata(&app, &failed).await;
        }
    }
}

#[tauri::command]
pub async fn media_start_image(
    app: AppHandle,
    permission: ImageTaskPermission,
    request: ImageRequest,
) -> Result<ImageJob, MediaError> {
    start_job(
        &ImageTaskContext {
            app,
            permission,
            mode: "edit".into(),
        },
        request,
    )
}

mod assets;
pub use assets::*;
mod recovery;
pub use recovery::*;

#[cfg(test)]
mod tests;
