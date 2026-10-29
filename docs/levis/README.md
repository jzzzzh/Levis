# Levis on top of Textus

Levis is a fork of [CatVinci-Studio/Textus](https://github.com/CatVinci-Studio/Textus).
Upstream is the source of truth: Levis keeps its features in its own files
and touches upstream files only with small, marked hooks (`Levis:` in a
comment), so it can be rebased onto every upstream release.

## Branches

| Branch               | What it is                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| `main`               | An exact mirror of `upstream/main`. Never commit to it.                  |
| `levis/integration`  | Upstream plus the Levis features, rebased onto `main` after each sync.   |
| `levis-dev`          | The old history before the move to upstream 1.3 (kept for reference).   |

Syncing with upstream:

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git checkout levis/integration
git rebase main
```

## Where Levis lives

| Area                     | Files                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Agent workspace          | `src/ai/workspace/`, `src/document-view/levis/`, `src/document-view/useDocumentWorkspace.ts`, `useWorkspacePersistence.ts` |
| Window-level wiring      | `src/app/levis/` (`LevisWindow`, source-mode guard, Save As helpers, window CSS)                          |
| Tab state                | `src/document/levis-tabs.ts`, `levis-recovery.ts`, `workspace-close.ts`                                    |
| Chat hooks               | `src/ai/chat/levis-chat.tsx` (`levis` prop on ChatBody, `levisToolbar` on ChatComposer), `ComposerMenu.tsx`, `tool-steps.ts` |
| Voice                    | `src/voice/` (dictation in any text field, read aloud), `src/document-view/WritePlayback.tsx`              |
| Magic Diary              | `src/ai/magic-diary/`, `src/theme/magic-diary-page.css`                                                    |
| Fill-in slots, selection | `src/editor/fill-slots/`, `src/editor/selection/`                                                          |
| Picture captions         | `src/editor/images/image-caption.ts`                                                                       |
| Settings                 | `src/prefs/levis-settings.ts`, `src/settings/levis/` (Settings › Levis, registered like a plugin's page)  |
| Strings                  | `src/i18n/locales/levis/<lang>.ts`, spread into each locale                                                |
| Backend bridge           | `src/platform/ipc-levis.ts`, `src/dev/levis-shim.ts`                                                       |
| Backend                  | `src-tauri/src/levis/`, `src-tauri/src/media/` (speech, dictation), `src-tauri/src/ai/diary.rs`            |

## Hooks in upstream files

Each is a line or a few, marked `Levis:` where a comment helps:

- `src/document-view/MilkdownEditor.tsx`: renders `<LevisWorkspace>` and
  wraps `onChange` with `reportingChanges`.
- `src/document-view/useEditorChat.ts`, `useEditorProposals.ts`,
  `EditorChatPortals.tsx`: the proposal router that lets the Agent's draft
  take the main conversation's proposals (`levis-proposal-router.ts`).
- `src/document-view/editor-extensions.ts`: `withLevisPlugins`.
- `src/document-view/EditorContextMenu.tsx`, `useEditorPopups.ts`: the
  read-aloud menu item, and the Agent layer keeping its own context menu.
- `src/ai/chat/ChatBody.tsx`, `ChatComposer.tsx`, `composer-types.ts`,
  `chat-body-types.ts`, `chat-history.ts`, `MarkdownText.tsx`,
  `window/ChatWindowApp.tsx` (dictation in the chat window).
- `src/app/App.tsx` (`<LevisWindow>`), `WindowBar.tsx` (two slots),
  `close-flow.ts`, `useFileOpening.ts`, `useSaveTabs.ts`,
  `useSourceModes.ts`, `useGlobalShortcuts.ts`, `tabs/useTabDragMerge.ts`.
- `src/document/doc-tabs.ts` (`workspaceId`, the title hook),
  `startup-restore.ts`, `useExternalChangeReload.ts`.
- `src/prefs/*` (settings and the toggle-surface shortcut),
  `src/i18n/locales/*.ts`.
- `src/settings/pages/ShortcutsPage.tsx`, `sections/shortcut-rows.tsx`.
- `eslint.config.js` (the `media` and `voice` feature folders),
  `scripts/check-code-shape.mjs` (the media adapters),
  `src/platform/commands.test.ts`, `e2e/helpers.ts`.
- Backend: `src-tauri/src/lib.rs` (`with_levis_commands!`, dictation's
  window cleanup), `main.rs` (the dev relaunch dictation's permissions
  need), `ai/mod.rs`, `ai/agent/prompt.rs` (the blanks rule),
  `commands/drafts.rs`, `tab_drag.rs`, `ai/rules/shared.rs`, `Cargo.toml`
  and `build.rs` (compiling `dictation.m`).

## What upstream now does instead

Where upstream has the same feature, Levis uses upstream's: image
generation and "Illustrate this paragraph" (Settings › Textus AI › Image
model), the image viewer, zoom and width presets, lazy KaTeX, Open Folder,
the sidebar button, the clipboard history and the composer's layout.

## Kept light

- The Agent surface (`AgentLayer.tsx`, `workspace.css`) and the Magic
  Diary's room (`app/levis/DiaryRoom.tsx`) are lazy chunks: Write and a
  diary that is off never load them.
- Start page Write and automatic titles off by default, so the app runs as
  upstream until Levis' features are switched on in Settings › Levis.
- The old external agent engine (Node harness) and the media image-job
  pipeline were removed; the fork's history is on `levis-dev`.
