import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, type DecorationSet } from "@milkdown/kit/prose/view";
import { decorateAll, redecorateChanged } from "../changed-ranges";

/**
 * Blanks to fill: 【开幕日期】, 【场馆名称】 - the Agent writes what it
 * doesn't know this way rather than inventing it (agent.rs). Each shows as
 * a chip; clicking one asks to fill it (FILL_SLOT_EVENT, handled by the
 * editor with suggestions from the document's context).
 */

/** A blank's text: full-width brackets around a short label. */
export const FILL_SLOT = /【([^【】\n]{1,40})】/g;

/** Dispatched (bubbling) from the editor that holds the clicked blank. */
export const FILL_SLOT_EVENT = "textus:fill-slot";

export interface FillSlotRequest {
  /** The blank's range in the document. */
  from: number;
  to: number;
  /** What it asks for, without the brackets. */
  label: string;
  /** Where to put the card, in viewport coordinates. */
  rect: { left: number; top: number; bottom: number };
}

/** Sentence punctuation: a blank names one thing (开幕日期, 场馆); a bracket
 *  holding a phrase like 【17岁，雨天，别开窗】 is the writer's own text. */
const PHRASE = /[，,。！!？?；;、：:…]/;

type Slot = { from: number; to: number; label: string };

/** The blanks in one textblock at `pos`. Code is left alone, and so are
 *  brackets that are not blanks: a phrase (PHRASE), or a bracket standing as
 *  a whole line on its own - a scene or section mark in prose (【第一幕】),
 *  where the Agent's blanks always sit inside a sentence or after a label. */
function blockSlots(block: ProseNode, pos: number): Slot[] {
  if (block.type.spec.code || block.type.name === "heading") return [];
  const slots: Slot[] = [];
  const whole = block.textContent.trim();
  block.forEach((node, offset) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((mark) => mark.type.spec.code)) return;
    for (const match of node.text.matchAll(FILL_SLOT)) {
      if (PHRASE.test(match[1]) || whole === match[0]) continue;
      const from = pos + 1 + offset + (match.index ?? 0);
      slots.push({ from, to: from + match[0].length, label: match[1].trim() });
    }
  });
  return slots;
}

/** The blanks in `doc`, in order. */
export function findFillSlots(doc: ProseNode): Slot[] {
  const slots: Slot[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isTextblock) return true;
    slots.push(...blockSlots(node, pos));
    return false;
  });
  return slots;
}

const fillSlotKey = new PluginKey<DecorationSet>("fill-slots");

const isTextblock = (node: ProseNode) => node.isTextblock;

const slotDecorations = (block: ProseNode, pos: number) =>
  blockSlots(block, pos).map((slot) =>
    Decoration.inline(slot.from, slot.to, {
      class: "fill-slot",
      "data-fill-slot": slot.label,
    }),
  );

export const fillSlotPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: fillSlotKey,
      state: {
        // Drawn once, then only in the blocks an edit touched: a whole
        // document scanned per keystroke was slow in a long one.
        init: (_, state) =>
          decorateAll(state.doc, isTextblock, slotDecorations),
        apply: (tr, previous) =>
          redecorateChanged(previous, tr, isTextblock, slotDecorations),
      },
      props: {
        decorations: (state) => fillSlotKey.getState(state),
        handleClick(view, pos, event) {
          const target = (event.target as HTMLElement | null)?.closest(
            ".fill-slot",
          );
          if (!target) return false;
          const $pos = view.state.doc.resolve(pos);
          if ($pos.depth === 0) return false;
          const slot = blockSlots($pos.parent, $pos.before()).find(
            (s) => s.from <= pos && pos <= s.to,
          );
          if (!slot) return false;
          const box = target.getBoundingClientRect();
          view.dom.dispatchEvent(
            new CustomEvent<FillSlotRequest>(FILL_SLOT_EVENT, {
              bubbles: true,
              detail: {
                ...slot,
                rect: { left: box.left, top: box.top, bottom: box.bottom },
              },
            }),
          );
          return true;
        },
      },
    }),
);
