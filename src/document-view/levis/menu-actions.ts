import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorRunner } from "../../editor/useEditorRunner";
import type { ContextMenuItem } from "../../ui/ContextMenu";

/** Levis' entries in the editor's right-click menu, set by each editor's
 *  Levis layer (LevisWorkspace) and read by EditorContextMenu. */
interface LevisMenuActions {
  /** Read the selection aloud (Write surface only). */
  readSelection?: () => void;
  language: string;
}

const byEditor = new Map<EditorRunner, LevisMenuActions>();

export function setLevisMenuActions(
  run: EditorRunner,
  actions: LevisMenuActions | null,
) {
  if (actions) byEditor.set(run, actions);
  else byEditor.delete(run);
}

export function levisMenuItems(run: EditorRunner): ContextMenuItem[] {
  const actions = byEditor.get(run);
  const read = actions?.readSelection;
  if (!read || run((ctx) => ctx.get(editorViewCtx).state.selection.empty))
    return [];
  return [
    {
      label: actions.language.startsWith("zh")
        ? "朗读所选文字"
        : "Read selected text",
      onSelect: read,
    },
  ];
}
