import type { EditorView } from "@milkdown/kit/prose/view";
import { NodeSelection } from "@milkdown/kit/prose/state";
import type { Attrs } from "@milkdown/kit/prose/model";
import type { Strings } from "../../i18n/strings";
import { currentStrings } from "../../i18n/current";
import { media } from "../../platform/ipc-levis";
import { imageWidthOf } from "./image-html";
import { splitImageTitle, turnedTitle } from "./image-rotation";
import { imageCaptionAt } from "./image-caption";
import { openImageViewer, type ImageViewerLabels } from "./image-viewer";
import { openDiagramViewer } from "../diagram-zoom";

/** Images Textus generated are stored as `image-<id>-<n>-<k>.<ext>`
 *  (media/jobs.rs); pasted ones are named by date or after the file. */
export function isGeneratedImage(src: string): boolean {
  // A Save As collision adds "-1", "-2"… to the name (fs.rs).
  return /(?:^|[\\/])image-\d+-\d+-\d+(?:-\d+)*\.(?:png|jpe?g|webp)$/i.test(
    src.split(/[?#]/)[0],
  );
}

function viewerLabels(t: Strings): ImageViewerLabels {
  return {
    zoomIn: t.imageZoomIn,
    zoomOut: t.imageZoomOut,
    rotateLeft: t.imageRotateLeft,
    rotateRight: t.imageRotateRight,
    close: t.imageViewerClose,
    prompt: t.imagePromptTitle,
    promptMissing: t.imagePromptMissing,
    copyPrompt: t.imageCopyPrompt,
    copied: t.loginLinkCopied,
  };
}

function imageAt(view: EditorView, pos: number) {
  const node = view.state.doc.nodeAt(pos);
  return node?.type.name === "image" ? node : null;
}

/** Rewrites one image's attrs as one undoable step, keeping it selected so
 *  its toolbar stays put. */
function updateImage(
  view: EditorView,
  pos: number,
  write: (attrs: Attrs) => Attrs,
) {
  const node = imageAt(view, pos);
  if (!node) return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, write(node.attrs));
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  view.dispatch(tr);
}

/** A quarter turn clockwise (1) or counter-clockwise (-1). A width still
 *  kept in the title moves to the `width` attribute on the way. */
export function rotateImageAt(view: EditorView, pos: number, turns: number) {
  updateImage(view, pos, (attrs) => ({
    ...attrs,
    title: turnedTitle(attrs.title as string, turns),
    width: imageWidthOf(attrs) ?? "",
  }));
}

/** The picture the node view at `pos` shows, once it has loaded. */
function shownImage(view: EditorView, pos: number) {
  const dom = view.nodeDOM(pos);
  const img =
    dom instanceof HTMLElement
      ? dom.querySelector<HTMLImageElement>("img")
      : null;
  return dom instanceof HTMLElement && img && img.naturalWidth > 0
    ? { dom, img }
    : null;
}

/** The picture at `pos` in the app's picture viewer (diagram-zoom). */
export function zoomImageAt(view: EditorView, pos: number) {
  const shown = shownImage(view, pos);
  if (shown) openDiagramViewer(shown.img, shown.dom);
}

/** A generated image with the prompt it came from, in the image viewer;
 *  its rotation buttons turn the document's image too. */
export function openImagePromptAt(view: EditorView, pos: number) {
  const node = imageAt(view, pos);
  const shown = shownImage(view, pos);
  if (!node || !shown) return;
  const src = (node.attrs.src as string) ?? "";
  openImageViewer({
    src: shown.img.currentSrc || shown.img.src,
    alt: (node.attrs.alt as string) ?? "",
    caption: imageCaptionAt(view.state.doc, pos),
    rotate: splitImageTitle(node.attrs.title as string).rotate,
    labels: viewerLabels(currentStrings()),
    showPrompt: true,
    loadPrompt: () => media.imagePrompt(src),
    onRotate: (turns) => {
      // The image may have moved while the viewer was open.
      const at = imageAtSrc(view, src) ?? pos;
      rotateImageAt(view, at, turns);
    },
  });
}

function imageAtSrc(view: EditorView, src: string): number | null {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "image" && node.attrs.src === src) found = pos;
    return true;
  });
  return found;
}
