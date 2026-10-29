//! MiniMax's native media protocol, separate from OpenAI compatibility.
use super::provider::MediaError;

pub fn transcription_request(
    request: reqwest::RequestBuilder,
    model: &str,
    bytes: Vec<u8>,
    mime: &str,
    extension: &str,
    language: Option<&str>,
) -> Result<reqwest::RequestBuilder, MediaError> {
    // Browser WebM/MP4 recording containers are converted locally to PCM WAV.
    if model != "asr-1.0" || mime != "audio/wav" {
        return Err(MediaError::new(
            "invalid_audio",
            "MiniMax ASR requires model asr-1.0 and locally converted WAV audio",
        ));
    }
    let file = reqwest::multipart::Part::bytes(bytes)
        .file_name(format!("recording.{extension}"))
        .mime_str(mime)
        .map_err(|_| MediaError::new("invalid_audio", "Invalid audio MIME"))?;
    let form = reqwest::multipart::Form::new()
        .text("model", model.to_owned())
        .text("response_format", "json")
        .text("stream", "false")
        .part("file", file);
    let mut request = request.multipart(form);
    if let Some(language) = language.filter(|l| !l.is_empty()) {
        let language = language.split('-').next().unwrap_or(language);
        if !matches!(
            language,
            "zh" | "yue"
                | "en"
                | "ja"
                | "ko"
                | "th"
                | "vi"
                | "id"
                | "ms"
                | "fil"
                | "ar"
                | "tr"
                | "fr"
                | "de"
                | "es"
                | "it"
                | "pt"
                | "pl"
                | "ru"
                | "uk"
        ) {
            return Err(MediaError::new(
                "invalid_request",
                "Select a supported MiniMax transcription language",
            ));
        }
        request = request.header("language", language);
    }
    Ok(request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcription_accepts_documented_bcp47_language_hints() {
        let request = transcription_request(
            reqwest::Client::new().post("https://api.minimax.cn/v1/speech_to_text"),
            "asr-1.0",
            vec![0; 44],
            "audio/wav",
            "wav",
            Some("ja-JP"),
        );
        assert_eq!(
            request.unwrap().build().unwrap().headers()["language"],
            "ja"
        );
    }
    #[tokio::test]
    async fn transcription_sends_language_in_header_and_nonstreaming_multipart() {
        let request = transcription_request(
            reqwest::Client::new().post("https://api.minimax.cn/v1/speech_to_text"),
            "asr-1.0",
            vec![0; 44],
            "audio/wav",
            "wav",
            Some("zh"),
        )
        .unwrap()
        .build()
        .unwrap();
        assert_eq!(request.headers()["language"], "zh");
        let body = request.body().unwrap();
        assert!(body.as_bytes().is_none()); // Multipart body remains streamed.
        assert!(transcription_request(
            reqwest::Client::new().post("https://example.com"),
            "asr-1.0",
            vec![0],
            "audio/webm",
            "webm",
            None
        )
        .is_err());
    }
}
