import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { readImagePresentation } from "./image-html";
import { parseEmbed } from "./obsidian-embed";
import "./image-caption.css";

/**
 * A picture's caption: a short paragraph that is all emphasis, right after
 * the picture - `*Caption*`, the way the Agent writes one and the way
 * Markdown elsewhere shows it. Drawn centred under the picture, and shown
 * under it in the image viewer.
 */

/** A paragraph of only images (or image embeds) and line breaks. */
function isImageParagraph(node: ProseNode): boolean {
  if (node.type.name !== "paragraph" || node.childCount === 0) return false;
  let images = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (
      child.type.name === "image" ||
      (child.type.name === "obsidian_embed" &&
        parseEmbed(child.textContent)?.isImage)
    )
      images++;
    else if (child.type.name !== "hardbreak") return false;
  }
  return images > 0;
}

function isCaptionParagraph(node: ProseNode): boolean {
  if (node.type.name !== "paragraph" || node.childCount !== 1) return false;
  // Italics are an md_span node here (md-span-schema.ts): `*` once.
  const span = node.child(0);
  return (
    span.type.name === "md_span" &&
    (span.attrs.delim === "*" || span.attrs.delim === "_") &&
    span.attrs.rung === 1 &&
    span.textContent.trim().length > 0 &&
    span.textContent.length <= 200
  );
}

/** The caption under the picture at `pos`, if it has one, else its title's
 *  visible text. */
export function imageCaptionAt(doc: ProseNode, pos: number): string {
  const $pos = doc.resolve(pos);
  const image = doc.nodeAt(pos);
  const title = readImagePresentation(
    image?.attrs.title as string | null,
  ).title.trim();
  if ($pos.depth < 1) return title;
  const paragraph = $pos.node($pos.depth);
  const container = $pos.node($pos.depth - 1);
  const index = $pos.index($pos.depth - 1);
  const next =
    index + 1 < container.childCount ? container.child(index + 1) : null;
  if (isImageParagraph(paragraph) && next && isCaptionParagraph(next))
    return next.textContent.trim();
  return title;
}

function captionDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = [];
  // Whether the textblock visited just before was a picture's paragraph.
  let afterImage = false;
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (afterImage && isCaptionParagraph(node))
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, { class: "image-caption" }),
        );
      afterImage = isImageParagraph(node);
      return false;
    }
    if (node.isBlock) afterImage = false;
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

const imageCaptionKey = new PluginKey<DecorationSet>("image-caption");

/** Draws each picture's caption paragraph as one (`p.image-caption`). */
export const imageCaptionPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: imageCaptionKey,
      state: {
        init: (_config, state) => captionDecorations(state.doc),
        apply: (tr, previous) =>
          tr.docChanged ? captionDecorations(tr.doc) : previous,
      },
      props: {
        decorations: (state) => imageCaptionKey.getState(state),
      },
    }),
);
