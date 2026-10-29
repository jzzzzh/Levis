import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  isGeneratedImage,
  openImagePromptAt,
  rotateImageAt,
  zoomImageAt,
} from "./images/image-actions";
import type { EditorRunner } from "./useEditorRunner";
import type { Strings } from "../i18n/strings";
import type { MenuEntry } from "./editor-menu";

/** A right-clicked picture: view it large, its prompt if Textus made it,
 *  and quarter turns. */
export function imageViewItems(
  run: EditorRunner,
  t: Strings,
  imagePos: number,
): MenuEntry[] {
  const generated =
    run((ctx) => {
      const node = ctx.get(editorViewCtx).state.doc.nodeAt(imagePos);
      return node?.type.name === "image"
        ? isGeneratedImage((node.attrs.src as string) ?? "")
        : false;
    }) ?? false;
  const withView = (fn: (view: EditorView) => void) => () =>
    run((ctx) => fn(ctx.get(editorViewCtx)));
  return [
    {
      label: t.imageViewLarge,
      onSelect: withView((view) => zoomImageAt(view, imagePos)),
    },
    ...(generated
      ? [
          {
            label: t.imageShowPrompt,
            onSelect: withView((view) => openImagePromptAt(view, imagePos)),
          },
        ]
      : []),
    {
      label: t.imageRotateLeft,
      onSelect: withView((view) => rotateImageAt(view, imagePos, -1)),
    },
    {
      label: t.imageRotateRight,
      onSelect: withView((view) => rotateImageAt(view, imagePos, 1)),
    },
  ];
}
