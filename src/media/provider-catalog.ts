import type {
  MediaCapability,
  MediaProviderConfig,
} from "../platform/ipc-levis";

type ProviderId = MediaProviderConfig["provider"];
/** The capabilities Settings › Media configures: speech both ways. */
export type SpeechCapability = Exclude<MediaCapability, "image">;
interface CapabilityPreset {
  model: string;
  voice?: string;
  endpoint?: string;
  language?: string;
}
export interface MediaProviderPreset {
  id: ProviderId;
  label: string;
  endpoint: string;
  /** Can sign in with the key of the same provider's text service. */
  reusesChatKey?: boolean;
  capabilities: Partial<Record<SpeechCapability, CapabilityPreset>>;
}

/** This is the capability matrix implemented by the native media adapters.
 * A preset is not a claim that a provider implements every OpenAI route. */
export const MEDIA_PROVIDER_PRESETS: readonly MediaProviderPreset[] = [
  {
    id: "system",
    label: "System · on device",
    endpoint: "",
    capabilities: { stt: { model: "system" } },
  },
  {
    id: "openai",
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    capabilities: {
      stt: { model: "gpt-4o-mini-transcribe" },
      tts: { model: "gpt-4o-mini-tts", voice: "alloy" },
    },
  },
  {
    id: "minimax",
    label: "MiniMax",
    endpoint: "https://api.minimax.cn/v1",
    reusesChatKey: true,
    capabilities: {
      stt: { model: "asr-1.0" },
      tts: { model: "speech-2.8-hd", voice: "English_expressive_narrator" },
    },
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    endpoint: "https://api.elevenlabs.io/v1",
    capabilities: {
      stt: { model: "scribe_v2" },
      tts: { model: "eleven_multilingual_v2", voice: "21m00Tcm4TlvDq8ikWAM" },
    },
  },
  {
    id: "deepgram",
    label: "Deepgram",
    endpoint: "https://api.deepgram.com/v1",
    capabilities: {
      stt: { model: "nova-3" },
      tts: { model: "aura-2-thalia-en", voice: "aura-2-thalia-en" },
    },
  },
  {
    id: "gemini",
    label: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    capabilities: {
      tts: { model: "gemini-3.8-flash-tts", voice: "Kore" },
    },
  },
  {
    id: "dashscope",
    label: "DashScope",
    endpoint: "https://dashscope.aliyuncs.com/api/v1",
    capabilities: {
      stt: { model: "qwen3-asr-flash" },
      tts: { model: "qwen3-tts-flash", voice: "Cherry" },
    },
  },
  {
    id: "azure-speech",
    label: "Azure Speech",
    endpoint: "",
    capabilities: {
      stt: {
        model: "default",
        endpoint: "https://eastus.stt.speech.microsoft.com",
        language: "en-US",
      },
      tts: {
        model: "default",
        endpoint: "https://eastus.tts.speech.microsoft.com",
        voice: "en-US-JennyNeural",
        language: "en-US",
      },
    },
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    endpoint: "https://api.siliconflow.cn/v1",
    capabilities: {
      stt: { model: "FunAudioLLM/SenseVoiceSmall" },
      tts: {
        model: "FunAudioLLM/CosyVoice2-0.5B",
        voice: "FunAudioLLM/CosyVoice2-0.5B:alex",
      },
    },
  },
  {
    id: "groq",
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    capabilities: {
      stt: { model: "whisper-large-v3-turbo" },
      tts: { model: "canopylabs/orpheus-v1-english", voice: "troy" },
    },
  },
  {
    id: "together",
    label: "Together",
    endpoint: "https://api.together.ai/v1",
    capabilities: {
      tts: { model: "hexgrad/Kokoro-82M", voice: "af_heart" },
    },
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    endpoint: "",
    capabilities: {
      stt: { model: "whisper-1" },
      tts: { model: "tts-1", voice: "alloy" },
    },
  },
];
export function mediaPresets(capability: SpeechCapability) {
  return MEDIA_PROVIDER_PRESETS.filter(
    (preset) => preset.capabilities[capability],
  );
}
/** Whether `provider` can reuse its text service's key (credentialSource
 *  "minimax-chat"). */
export function reusesChatKey(provider: ProviderId): boolean {
  return !!MEDIA_PROVIDER_PRESETS.find((p) => p.id === provider)?.reusesChatKey;
}
export function mediaProviderDefaults(
  provider: ProviderId,
  capability: SpeechCapability,
): MediaProviderConfig {
  const preset = MEDIA_PROVIDER_PRESETS.find((p) => p.id === provider);
  const defaults = preset?.capabilities[capability];
  if (!preset || !defaults) throw new Error("Unsupported media capability");
  return {
    provider,
    endpoint: defaults.endpoint ?? preset.endpoint,
    model: defaults.model,
    voice: defaults.voice ?? null,
    credentialSource: "separate",
    language: defaults.language ?? null,
    playbackRate: 1,
  };
}
