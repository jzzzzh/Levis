// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMA-BUF renderer draws a blank window or crashes on NVIDIA's
    // proprietary driver, so fall back to the older renderer there unless the user
    // set it. Set before any thread exists, which makes set_var sound.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && std::path::Path::new("/proc/driver/nvidia/version").exists()
    {
        // SAFETY: first statement of main, single-threaded.
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
    // Levis: dictation's privacy prompts need their own responsible process.
    #[cfg(all(target_os = "macos", debug_assertions))]
    dev_responsibility::run_as_own_responsible_process();
    textus_lib::run()
}

#[cfg(all(target_os = "macos", debug_assertions))]
mod dev_responsibility;
