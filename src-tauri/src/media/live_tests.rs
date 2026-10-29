//! Opt-in paid smoke tests. Secrets are loaded inside Rust and never logged.
use super::{minimax, provider};
use crate::auth::custom_endpoint::CustomEndpointConfig;

fn request(suffix: &str) -> reqwest::RequestBuilder {
    assert_eq!(
        std::env::var("TEXTUS_MINIMAX_LIVE").as_deref(),
        Ok("1"),
        "Explicitly opt in to paid MiniMax tests"
    );
    let directory = std::path::PathBuf::from(
        std::env::var_os("TEXTUS_MINIMAX_CONFIG_DIR").expect("Set the Textus config directory"),
    );
    let text: CustomEndpointConfig = serde_json::from_slice(
        &std::fs::read(directory.join("custom_endpoint.json"))
            .expect("Read text provider configuration"),
    )
    .expect("Decode text provider configuration");
    let key = provider::minimax_chat_key(&text, "https://api.minimax.cn/v1")
        .expect("Resolve MiniMax text credential");
    super::media_client(120)
        .expect("Create media client")
        .post(format!("https://api.minimax.cn/v1/{suffix}"))
        .bearer_auth(key)
}

#[tokio::test]
#[ignore = "Paid MiniMax transcription request; uses synthetic local speech, never microphone audio"]
async fn minimax_live_speech_input() {
    let input = std::path::PathBuf::from(
        std::env::var_os("TEXTUS_STT_TEST_WAV").expect("Set a synthetic PCM WAV fixture"),
    );
    let bytes = std::fs::read(input).unwrap();
    assert!(bytes.starts_with(b"RIFF") && bytes.len() < super::speech::MAX_RECORDING_BYTES);
    let response = minimax::transcription_request(
        request("speech_to_text"),
        "asr-1.0",
        bytes,
        "audio/wav",
        "wav",
        Some("en"),
    )
    .unwrap()
    .send()
    .await
    .map_err(provider::network_error)
    .unwrap();
    let raw = provider::read_response(response, 1024 * 1024)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&raw).unwrap();
    let text = json
        .get("text")
        .and_then(|v| v.as_str())
        .expect("Recognized text");
    assert!(
        text.to_lowercase().contains("speech"),
        "Synthetic fixture should mention speech"
    );
    println!("MiniMax synthetic speech recognized: {text}");
}
