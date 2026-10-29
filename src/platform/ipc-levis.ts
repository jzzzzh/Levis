import { Channel } from "@tauri-apps/api/core";
import type { DocumentDraft } from "../ai/workspace/document-draft";
import { aiCall, call } from "./ipc-call";
import { auth } from "./ipc-auth";

/**
 * Levis' backend commands (src-tauri/src/media, ai/diary.rs, ai/project.rs'
 * entries, commands/drafts.rs' workspace snapshots), kept apart from
 * upstream's typed bindings so a rebase onto Textus never conflicts here.
 * Plain `invoke`: these commands are not in the specta bindings.
 */

/** Mirrors media/provider.rs and media/speech.rs. Credentials stay in
 *  provider_keys.json. */
export type MediaCapability = "stt" | "tts" | "image";
export interface MediaProviderConfig {
  credentialSource?: "separate" | "minimax-chat";
  provider:
    | "system"
    | "openai"
    | "openai-compatible"
    | "minimax"
    | "elevenlabs"
    | "deepgram"
    | "gemini"
    | "dashscope"
    | "azure-speech"
    | "siliconflow"
    | "groq"
    | "together"
    | "volcengine";
  language?: string | null;
  playbackRate?: number;
  endpoint: string;
  model: string;
  voice: string | null;
}
export type MediaProviders = Partial<
  Record<MediaCapability, MediaProviderConfig>
>;
export interface SpeechAudio {
  dataBase64: string;
  mime: string;
}
/** Mirrors media/jobs.rs; authorization is outside the model's tool
 *  arguments. */
export interface ImageTaskPermission {
  generationId: string;
  taskId: string;
  documentId: string;
  baseRevision: number;
  allowAutomatic: boolean;
}
export interface ImageGenerationRequest {
  prompt: string;
  anchor: string;
  alt: string;
  caption?: string | null;
  size?: string | null;
  quality?: string | null;
}
export interface ImageJob {
  generationId?: string;
  jobId: string;
  taskId: string;
  documentId: string;
  baseRevision: number;
  sequence: number;
  request: ImageGenerationRequest;
  status:
    | "queued"
    | "running"
    | "ready"
    | "failed"
    | "cancelled"
    | "preparing"
    | "prepared"
    | "committed";
  previewPath: string | null;
  error: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
  assetSrc: string | null;
}

/** Fired after a media provider is configured, for open settings rows. */
export const MEDIA_SETTINGS_CHANGE = "textus-media-settings-change";

export const media = {
  cancelImageGeneration: (permission: ImageTaskPermission) =>
    call<void>("media_cancel_image_generation", { permission }),
  rebaseImageAssets: (
    documentId: string,
    mappings: { old: string; new: string }[],
  ) => call<void>("media_rebase_image_assets", { documentId, mappings }),
  providers: () => call<MediaProviders>("media_provider_status"),
  configure: async (
    capability: MediaCapability,
    config: MediaProviderConfig | null,
  ) => {
    await call<void>("media_configure_provider", { capability, config });
    window.dispatchEvent(new Event(MEDIA_SETTINGS_CHANGE));
  },
  keyStatus: (capability: MediaCapability) =>
    auth.providerApiKeyStatus(`__media_${capability}`),
  setKey: (capability: MediaCapability, key: string) =>
    auth.setProviderApiKey(`__media_${capability}`, key),
  clearKey: (capability: MediaCapability) =>
    auth.clearProviderApiKey(`__media_${capability}`),
  transcribe: (
    requestId: string,
    dataBase64: string,
    mime: string,
    language: string | null,
  ) =>
    aiCall<string>("media_transcribe", {
      requestId,
      dataBase64,
      mime,
      language,
    }),
  synthesize: (requestId: string, text: string, voice: string | null = null) =>
    aiCall<SpeechAudio>("media_synthesize", { requestId, text, voice }),
  cancel: (requestId: string) => call<void>("media_cancel", { requestId }),
  startImage: (
    permission: ImageTaskPermission,
    request: ImageGenerationRequest,
  ) => aiCall<ImageJob>("media_start_image", { permission, request }),
  imageJobs: (documentId: string) =>
    call<ImageJob[]>("media_image_jobs", { documentId }),
  cancelImage: (jobId: string) => call<void>("media_cancel_image", { jobId }),
  /** The prompt a Levis-generated image came from, by its src; null for
   *  other images. */
  imagePrompt: (src: string) =>
    call<{
      prompt: string;
      model: string | null;
      width: number | null;
      height: number | null;
    } | null>("media_image_prompt", { src }),
  prepareImage: (jobId: string, docPath: string | null) =>
    call<string>("media_prepare_image", { jobId, docPath }),
  finishImage: (jobId: string, accepted: boolean) =>
    call<void>("media_finish_image", { jobId, accepted }),
};

/** One file of the project folder (ai::project::ProjectEntry). */
export interface ProjectEntry {
  /** Relative to the project folder, `/`-separated. */
  path: string;
  /** text: read as is; document: Word/PDF/slides/sheet, text extracted;
   *  image: shown by path; other: listed only. */
  kind: "text" | "document" | "image" | "other";
  bytes: number;
}

export const levisAi = {
  /** The Magic Diary (ai/diary.rs): one short aside answering a line the
   *  reader just wrote, in the voice of the diary's other inhabitant. Its
   *  own command because completion's prompt forbids everything this needs.
   *  `requestId` pairs with ai_cancel. */
  diaryReply: (args: {
    provider: string;
    /** The absorbed line, verbatim. */
    line: string;
    /** Everything already said on this page, oldest first. */
    history?: { line: string; reply: string }[];
    model: string | null;
    /** The app's language, so the aside is written in the reader's own. */
    uiLanguage: string | null;
    requestId: string;
  }) =>
    aiCall<string>("ai_diary_reply", {
      provider: args.provider,
      line: args.line,
      history: args.history ?? [],
      model: args.model,
      uiLanguage: args.uiLanguage,
      requestId: args.requestId,
    }),
  /** Every file of the project folder with its kind - the auto-writing file
   *  tree. */
  listProjectEntries: (docPath: string | null, workspaceRoot: string | null) =>
    call<ProjectEntry[]>("list_project_entries", { docPath, workspaceRoot }),
  /** The project folder in use: the chosen one, else the document's own. */
  projectFolder: (docPath: string | null, workspaceRoot: string | null) =>
    call<string | null>("project_folder", { docPath, workspaceRoot }),
};

/** Mirrors commands/drafts.rs WorkspaceSnapshot; body uses the proposal
 *  schema. */
export interface WorkspaceSnapshot {
  schemaVersion: 1;
  documentId: string;
  tabId?: string;
  documentPath: string | null;
  updatedAt: number;
  status: "running" | "review" | "interrupted";
  draft: DocumentDraft;
}
export const workspaceDrafts = {
  save: (snapshot: WorkspaceSnapshot) =>
    call<void>("save_workspace_snapshot", { snapshot }),
  load: (documentId: string) =>
    call<WorkspaceSnapshot | null>("load_workspace_snapshot", { documentId }),
  clear: (documentId: string) =>
    call<void>("clear_workspace_snapshot", { documentId }),
  takeRecoveries: () => call<WorkspaceSnapshot[]>("take_workspace_snapshots"),
};

export interface DictationEvent {
  text: string;
  done: boolean;
  error: boolean;
}
export const dictation = {
  start: (language: string, onEvent: (event: DictationEvent) => void) => {
    const channel = new Channel<DictationEvent>();
    channel.onmessage = onEvent;
    return call<number>("dictation_start", { language, onEvent: channel });
  },
  stop: (token: number) => call<void>("dictation_stop", { token }),
};
