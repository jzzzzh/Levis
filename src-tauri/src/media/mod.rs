pub mod image;
pub mod jobs;
#[cfg(test)]
mod live_tests;
mod minimax;
mod protocols;
pub mod provider;
pub mod speech;

pub mod dictation;

/// Media requests share the configured proxy, with a capability-specific
/// total timeout and no redirects carrying credentials to another host.
pub(crate) fn media_client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    let mut client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(timeout_seconds))
        .redirect(reqwest::redirect::Policy::none());
    if let Some(proxy) = aicompat::http::proxy_url() {
        client =
            client.proxy(reqwest::Proxy::all(proxy).map_err(|_| "invalid proxy configuration")?);
    }
    client
        .build()
        .map_err(|_| "cannot create media client".to_string())
}
