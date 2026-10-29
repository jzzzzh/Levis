import { PluginKey, type Transaction } from "@milkdown/kit/prose/state";

/** One line the diary absorbed, and its reply. */
export interface Turn {
  id: number;
  from: number;
  to: number;
  line: string;
  reply: string;
  stage: "absorbing" | "writing" | "done" | "leaving";
}
/** The diary's plugin state: its turns, the one in hand and the one being
 *  read back, and where the composer paragraph starts. */
export interface DiaryState {
  turns: Turn[];
  active: number | null;
  browsing: number | null;
  composer: number;
}
export type Meta =
  | { type: "absorb"; turn: Turn; composer: number }
  | { type: "reply"; id: number; text: string }
  | { type: "settle"; id: number }
  | { type: "leave"; id: number }
  | { type: "finish" }
  | { type: "cancel"; id: number }
  | { type: "browse"; index: number | null };
export const diaryKey = new PluginKey<DiaryState>("magic-diary");

export const initialDiaryState = (): DiaryState => ({
  turns: [],
  active: null,
  browsing: null,
  composer: 1,
});

/** The diary state after `tr`: turns mapped through it (a prompt edited
 *  away is dropped), then the transaction's own step, if any. */
export function applyDiary(
  tr: Transaction,
  prev: DiaryState,
  enabled: () => boolean,
): DiaryState {
  let next: DiaryState = {
    ...prev,
    composer: tr.mapping.map(prev.composer, -1),
    turns: prev.turns.flatMap((turn) => {
      const from = tr.mapping.map(turn.from, 1),
        to = tr.mapping.map(turn.to, -1);
      const node = tr.doc.nodeAt(from);
      return to > from &&
        node?.isTextblock &&
        to === from + node.nodeSize &&
        node.textContent.trim() === turn.line
        ? [{ ...turn, from, to }]
        : [];
    }),
  };
  // Undo or a document replacement may remove the active prompt.
  // Its request must lose ownership too, so input is never locked.
  if (next.active !== null && !next.turns.some((t) => t.id === next.active)) {
    next = {
      ...next,
      active: null,
      browsing: null,
      composer: tr.selection.$from.depth ? tr.selection.$from.start() : 1,
    };
  }
  if (!enabled()) {
    return {
      ...next,
      active: null,
      browsing: null,
      turns: next.turns.filter((t) => t.stage === "done"),
    };
  }
  const meta = tr.getMeta(diaryKey) as Meta | undefined;
  if (!meta) return tr.docChanged ? { ...next, browsing: null } : next;
  switch (meta.type) {
    case "absorb":
      next = {
        ...next,
        turns: [...next.turns, meta.turn],
        active: meta.turn.id,
        browsing: null,
        composer: meta.composer,
      };
      break;
    case "reply":
      next.turns = next.turns.map((t) =>
        t.id === meta.id ? { ...t, reply: meta.text, stage: "writing" } : t,
      );
      break;
    case "settle":
      next.turns = next.turns.map((t) =>
        t.id === meta.id ? { ...t, stage: "done" } : t,
      );
      break;
    case "leave":
      next.turns = next.turns.map((t) =>
        t.id === meta.id ? { ...t, stage: "leaving" } : t,
      );
      break;
    case "finish":
      next = {
        ...next,
        active: null,
        browsing: null,
        turns: next.turns.map((t) =>
          t.stage === "leaving" ? { ...t, stage: "done" } : t,
        ),
      };
      break;
    case "cancel":
      next = {
        ...next,
        turns: next.turns.filter((t) => t.id !== meta.id),
        composer: tr.selection.$from.depth ? tr.selection.$from.start() : 1,
        active: null,
        browsing: null,
      };
      break;
    case "browse":
      next.browsing = meta.index;
      break;
  }
  return next;
}
