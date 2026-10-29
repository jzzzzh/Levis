# Speech providers

Dictation (speech to text) and reading aloud (text to speech), configured in
Settings › Levis › Speech services. Each capability has its own provider,
endpoint, model, voice, language and playback rate; API keys stay in the
native private key store. A MiniMax text key may be reused only between
MiniMax HTTPS hosts. Picture generation is upstream's (Settings › Textus AI ›
Image model).

| Provider ID         | STT   | TTS | API base and suggested models / voices                                                                 |
| ------------------- | ----- | --- | ------------------------------------------------------------------------------------------------------ |
| `system`            | Local | —   | macOS on-device dictation, live partial text; no endpoint or key                                       |
| `openai`            | Yes   | Yes | `https://api.openai.com/v1`; `gpt-4o-mini-transcribe`, `gpt-4o-mini-tts` / `alloy`                     |
| `openai-compatible` | Yes   | Yes | Your base URL; `/audio/transcriptions`, `/audio/speech`                                                |
| `minimax`           | Yes   | Yes | `https://api.minimax.cn/v1`; `asr-1.0`, `speech-2.8-hd` / `English_expressive_narrator`                |
| `elevenlabs`        | Yes   | Yes | `https://api.elevenlabs.io/v1`; `scribe_v2`, `eleven_multilingual_v2` / a voice ID                     |
| `deepgram`          | Yes   | Yes | `https://api.deepgram.com/v1`; `nova-3`, `aura-2-thalia-en`                                            |
| `gemini`            | —     | Yes | `https://generativelanguage.googleapis.com/v1beta`; `gemini-3.8-flash-tts` / `Kore`                    |
| `dashscope`         | Yes   | Yes | `https://dashscope.aliyuncs.com/api/v1`; `qwen3-asr-flash`, `qwen3-tts-flash` / `Cherry`               |
| `azure-speech`      | Yes   | Yes | `https://<region>.stt.speech.microsoft.com` (TTS: `.tts.`); model `default`, voice `en-US-JennyNeural` |
| `siliconflow`       | Yes   | Yes | `https://api.siliconflow.cn/v1`; `FunAudioLLM/SenseVoiceSmall`, `FunAudioLLM/CosyVoice2-0.5B:alex`     |
| `groq`              | Yes   | Yes | `https://api.groq.com/openai/v1`; `whisper-large-v3-turbo`, `canopylabs/orpheus-v1-english` / `troy`   |
| `together`          | —     | Yes | `https://api.together.ai/v1`; `hexgrad/Kokoro-82M` / `af_heart`                                        |

Defaults are editable; accounts and regions vary. Wire formats live in
`src-tauri/src/media/protocols.rs`. Limits: recordings up to 25 MiB, speech
input 1–3000 characters, synthesized audio up to 15 MiB (WAV or MP3);
playback rate 0.5–2, applied locally. Downloads go through the public-address,
DNS-pinned HTTPS downloader, with no redirects and bounded bodies.

Local HTTP fixtures test every adapter without keys. The opt-in paid MiniMax
speech test is `media::live_tests::minimax_live_speech_input`
(`TEXTUS_MINIMAX_LIVE=1`, `TEXTUS_STT_TEST_WAV=<pcm wav>`, `--ignored`).
