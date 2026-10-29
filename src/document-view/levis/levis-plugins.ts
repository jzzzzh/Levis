import type { Editor } from "@milkdown/kit/core";
import { documentRevisionPlugin } from "../../ai/workspace/revision-plugin";
import { speechHighlightPlugin } from "../../voice/speech-highlight-plugin";
import { inactiveSelectionPlugin } from "../../editor/selection/inactive-selection-plugin";
import { fillSlotPlugin } from "../../editor/fill-slots/fill-slot-plugin";
import { createMagicDiaryPlugin } from "../../ai/magic-diary/magic-diary-plugin";
import type { Settings } from "../../prefs/SettingsContext";
import type { TourAi } from "../../utils/events";
import { installProseMirrorSpeedups } from "../../editor/prosemirror-speedups";

// Long documents: ProseMirror lookups that were linear made logarithmic.
installProseMirrorSpeedups();

/**
 * Levis' editor plugins, after upstream's (editor-extensions.ts): the
 * workspace's revision counter, read-aloud highlight, image job frames,
 * fill-in slots, the kept selection, and the Magic Diary.
 */
export function withLevisPlugins(
  editor: Editor,
  settings: { readonly current: Settings },
  tour: { readonly current: TourAi | null },
): Editor {
  return editor
    .use(documentRevisionPlugin)
    .use(speechHighlightPlugin)
    .use(fillSlotPlugin)
    .use(inactiveSelectionPlugin)
    .use(
      createMagicDiaryPlugin({
        enabled: () =>
          settings.current.enableMagicDiary &&
          settings.current.textusAi &&
          tour.current === null,
        provider: () => settings.current.aiProvider,
        model: () =>
          settings.current.writingModels[settings.current.aiProvider] || null,
        uiLanguage: () => settings.current.language,
      }),
    );
}
