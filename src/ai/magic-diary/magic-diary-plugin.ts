import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { isImeKeydown } from "../../utils/ime";
import { ai } from "../../platform/ipc";
import { levisAi } from "../../platform/ipc-levis";
import { scriptedReply } from "./diary-replies";
import { storyReply } from "./diary-story";
import { WALKER_ARRIVED_EVENT } from "./footprint-gait";
import {
  applyDiary,
  diaryKey as key,
  initialDiaryState,
  type DiaryState,
  type Meta,
  type Turn,
} from "./diary-state";
import { mountDiaryPaper } from "./diary-paper";
import "./magic-diary.css";

const MAX_LINE_CHARS = 200;
const DWELL_MS = 10_000;
const FADE_MS = 520;
const REPLY_BUDGET_MS = 15_000;
export const MAGIC_DIARY_EVENT = "textus:magic-diary";
export type MagicDiaryPhase = "absorbed" | "thinking" | "replying" | "leaving";
export interface MagicDiaryEvent {
  phase: MagicDiaryPhase;
  turnId?: number;
  at?: { left: number; top: number; width: number; height: number };
}
export interface MagicDiaryOptions {
  enabled: () => boolean;
  provider: () => string;
  model: () => string | null;
  uiLanguage: () => string;
}
let serial = 0;
export function absorbableLine(
  doc: ProseNode,
  caret: number,
  after = -1,
): { textFrom: number; textTo: number; line: string } | null {
  if (caret < 0 || caret > doc.content.size) return null;
  const $pos = doc.resolve(caret);
  const parent = $pos.parent;
  if (parent.type.name !== "paragraph") return null;
  if ($pos.parentOffset !== parent.content.size) return null;
  const start = $pos.start($pos.depth);
  const textTo = $pos.end($pos.depth);
  const lineFrom = after >= start && after <= textTo ? after : start;
  const line = doc.textBetween(lineFrom, textTo, " ").trim();
  if (!line || line.length > MAX_LINE_CHARS) return null;
  return { textFrom: lineFrom, textTo, line };
}

/** Original prompts stay in the document for autosave and undo. Only the
 * current composer is visible; answers and history are ephemeral widgets. */
export function createMagicDiaryPlugin(options: MagicDiaryOptions) {
  let view: EditorView | null = null;
  let live: {
    id: number;
    requestId: string;
    arrived: boolean;
    reply?: string;
  } | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const widgets = new Map<string, HTMLElement>();
  function later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
    return timer;
  }
  function clearTimers() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }
  function state() {
    return view ? key.getState(view.state) : undefined;
  }
  function isCurrent(id: number) {
    return (
      !!view && options.enabled() && live?.id === id && state()?.active === id
    );
  }
  function dispatch(meta: Meta) {
    if (view)
      view.dispatch(
        view.state.tr.setMeta(key, meta).setMeta("addToHistory", false),
      );
  }
  function announce(phase: MagicDiaryPhase) {
    if (!view || view.dom.closest('[data-active-tab="false"]')) return;
    const node = view.nodeDOM(state()?.composer ? state()!.composer - 1 : 0);
    const box =
      node instanceof HTMLElement
        ? node.getBoundingClientRect()
        : view.dom.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent<MagicDiaryEvent>(MAGIC_DIARY_EVENT, {
        detail: {
          phase,
          turnId: live?.id,
          at: {
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          },
        },
      }),
    );
  }
  function stopRequest() {
    clearTimers();
    if (live) void ai.cancelAgentMessage(live.requestId).catch(() => {});
    live = null;
  }
  function finish() {
    stopRequest();
    dispatch({ type: "finish" });
    widgets.clear();
    if (
      view &&
      options.enabled() &&
      !view.dom.closest('[data-active-tab="false"]')
    )
      view.focus();
  }
  function leave(id: number) {
    if (!isCurrent(id)) return;
    announce("leaving");
    dispatch({ type: "leave", id });
    later(finish, FADE_MS);
  }
  function cancel(announceDeparture = true) {
    const current = state();
    const turn = current?.turns.find((t) => t.id === current.active);
    if (!turn || !view) return;
    if (announceDeparture) announce("leaving");
    if (turn.stage === "done" || turn.stage === "leaving") {
      finish();
      return;
    }
    stopRequest();
    // Remove only the empty composer we inserted; restore the user's prompt.
    const tr = view.state.tr;
    const composerNode = tr.doc.nodeAt(current!.composer - 1);
    if (composerNode?.isTextblock && !composerNode.content.size)
      tr.delete(
        current!.composer - 1,
        current!.composer - 1 + composerNode.nodeSize,
      );
    tr.setSelection(
      TextSelection.near(
        tr.doc.resolve(Math.min(turn.to - 1, tr.doc.content.size)),
      ),
    );
    tr.setMeta(key, { type: "cancel", id: turn.id } satisfies Meta).setMeta(
      "addToHistory",
      false,
    );
    view.dispatch(tr);
    widgets.clear();
    if (!view.dom.closest('[data-active-tab="false"]')) view.focus();
  }
  // The map has one walker across all mounted editors. A newly submitted
  // turn takes ownership; release the displaced turn without redirecting
  // the walker or stealing focus from its new tab.
  function onDiaryEvent(event: Event) {
    const { phase, turnId } = (event as CustomEvent<MagicDiaryEvent>).detail;
    if (phase === "absorbed" && live && turnId !== live.id) cancel(false);
  }
  async function ask(id: number, line: string) {
    if (!isCurrent(id) || !live) return;
    announce("thinking");
    const language = options.uiLanguage();
    const history = state()!
      .turns.filter((t) => t.id !== id && t.reply)
      .map((t) => ({ line: t.line, reply: t.reply }));
    const fragment = storyReply(language, line, history);
    if (fragment) {
      live.reply = fragment;
      revealWhenReady();
      return;
    }
    const requestId = live.requestId;
    let budget: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<string>((resolve) => {
      budget = later(() => {
        void ai.cancelAgentMessage(requestId).catch(() => {});
        resolve("");
      }, REPLY_BUDGET_MS);
    });
    const request = levisAi
      .diaryReply({
        provider: options.provider(),
        model: options.model(),
        uiLanguage: language,
        line,
        history,
        requestId,
      })
      .then((text) => (typeof text === "string" ? text : ""))
      .catch(() => "");
    const reply =
      (await Promise.race([request, timeout])).trim() ||
      scriptedReply(language, line, history);
    if (budget) {
      clearTimeout(budget);
      timers.delete(budget);
    }
    if (!isCurrent(id)) return;
    live!.reply = reply;
    revealWhenReady();
  }
  function revealWhenReady() {
    if (!live || !isCurrent(live.id) || !live.arrived || !live.reply) return;
    const current = state()?.turns.find((turn) => turn.id === live!.id);
    if (current?.stage !== "absorbing") return;
    dispatch({ type: "reply", id: live.id, text: live.reply });
    announce("replying");
  }
  function onArrived(event: Event) {
    const { turnId } = (event as CustomEvent<{ turnId?: number }>).detail;
    if (!live || live.id !== turnId) return;
    live.arrived = true;
    revealWhenReady();
  }
  function replyElement(turn: Turn, browsing: boolean) {
    const widgetKey = `${turn.id}-${browsing ? "history" : "live"}`;
    const cached = widgets.get(widgetKey);
    if (cached) return cached;
    const wrap = document.createElement("span");
    wrap.className = `magic-diary-reply magic-diary-reply-${browsing ? "settled" : turn.stage}`;
    wrap.contentEditable = "false";
    wrap.setAttribute("role", "status");
    wrap.setAttribute(
      "aria-label",
      options.uiLanguage().startsWith("zh") ? "日记的回答" : "Diary reply",
    );
    const ink = document.createElement("span");
    ink.className = "magic-diary-ink";
    wrap.appendChild(ink);
    widgets.set(widgetKey, wrap);
    if (browsing || turn.stage !== "writing") {
      ink.textContent = turn.reply;
      return wrap;
    }
    const chars = Array.from(turn.reply);
    let index = 0;
    function tick() {
      if (!isCurrent(turn.id) || !ink.isConnected) return;
      if (index === chars.length) {
        wrap.classList.remove("magic-diary-reply-writing");
        wrap.classList.add("magic-diary-reply-settled");
        dispatch({ type: "settle", id: turn.id });
        // Start the reading time only after the last character is written.
        later(() => leave(turn.id), DWELL_MS);
        return;
      }
      const ch = chars[index++];
      const nib = document.createElement("span");
      nib.className = "magic-diary-char";
      nib.textContent = ch;
      ink.appendChild(nib);
      later(
        tick,
        /[。，！？、,.!?；;]/.test(ch)
          ? 190
          : /[\u1100-\uffef]/.test(ch)
            ? 74
            : 46,
      );
    }
    later(tick, 100);
    return wrap;
  }
  function decorations(doc: ProseNode, current: DiaryState) {
    const result: Decoration[] = [];
    for (const turn of current.turns) {
      if (turn.from >= 0 && turn.to <= doc.content.size && turn.to > turn.from)
        result.push(
          Decoration.node(turn.from, turn.to, {
            class: "magic-diary-archived",
          }),
        );
    }
    const turn =
      current.active !== null
        ? current.turns.find((t) => t.id === current.active)
        : current.browsing !== null
          ? current.turns.filter((t) => t.reply && t.stage === "done")[
              current.browsing
            ]
          : undefined;
    const composer = doc.nodeAt(current.composer - 1);
    if (turn && composer?.isTextblock) {
      result.push(
        Decoration.node(
          current.composer - 1,
          current.composer - 1 + composer.nodeSize,
          { class: "magic-diary-presenting" },
        ),
      );
      if (composer.content.size)
        result.push(
          Decoration.inline(
            current.composer,
            current.composer + composer.content.size,
            { class: "magic-diary-draft-hidden" },
          ),
        );
      if (turn.reply)
        result.push(
          Decoration.widget(
            current.composer,
            () => replyElement(turn, current.browsing !== null),
            {
              key: `reply-${turn.id}-${current.browsing !== null}`,
              side: -1,
              ignoreSelection: true,
            },
          ),
        );
      else
        result.push(
          Decoration.widget(
            current.composer,
            () => {
              const ghost = document.createElement("span");
              ghost.className = "magic-diary-ghost";
              ghost.textContent = turn.line;
              ghost.contentEditable = "false";
              return ghost;
            },
            { key: `ghost-${turn.id}`, side: -1, ignoreSelection: true },
          ),
        );
    }
    return DecorationSet.create(doc, result);
  }
  const plugin = new Plugin<DiaryState>({
    key,
    state: {
      init: initialDiaryState,
      apply: (tr, prev) => applyDiary(tr, prev, options.enabled),
    },
    props: {
      decorations(editorState) {
        return options.enabled()
          ? decorations(editorState.doc, key.getState(editorState)!)
          : DecorationSet.empty;
      },
      handleTextInput() {
        if (!options.enabled()) return false;
        if (state()?.active !== null) return true;
        if (state()?.browsing !== null)
          dispatch({ type: "browse", index: null });
        return false;
      },
      handlePaste() {
        return options.enabled() && state()?.active !== null;
      },
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          if (options.enabled() && state()?.active !== null) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      handleKeyDown(editorView, event) {
        if (!options.enabled() || editorView.composing || isImeKeydown(event))
          return false;
        let current = key.getState(editorView.state)!;
        const active = current.turns.find((t) => t.id === current.active);
        if (
          active?.stage === "done" &&
          (event.key === "ArrowUp" || event.key === "ArrowDown") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey
        ) {
          announce("leaving");
          finish();
          // The answer being read is the newest history item. Start there
          // so Up selects the preceding answer and Down returns to input.
          dispatch({
            type: "browse",
            index:
              state()!.turns.filter((t) => t.reply && t.stage === "done")
                .length - 1,
          });
          current = key.getState(editorView.state)!;
        }
        if (current.active !== null) {
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
            return true;
          }
          // Input belongs to the reader again after the reply disappears.
          if (!event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            return true;
          }
          return false;
        }
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
          return false;
        if (
          (event.key === "Backspace" || event.key === "ArrowLeft") &&
          editorView.state.selection.empty &&
          editorView.state.selection.from === current.composer &&
          current.turns.length
        ) {
          event.preventDefault();
          return true;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const history = current.turns.filter(
            (t) => t.reply && t.stage === "done",
          );
          if (!history.length) return false;
          const index = current.browsing ?? history.length;
          const next =
            event.key === "ArrowUp"
              ? Math.max(0, index - 1)
              : Math.min(history.length, index + 1);
          event.preventDefault();
          dispatch({
            type: "browse",
            index: next === history.length ? null : next,
          });
          return true;
        }
        if (current.browsing !== null) {
          dispatch({ type: "browse", index: null });
          if (event.key === "Escape") {
            event.preventDefault();
            return true;
          }
        }
        if (event.key !== "Enter" || !editorView.state.selection.empty)
          return false;
        const at = absorbableLine(
          editorView.state.doc,
          editorView.state.selection.from,
        );
        if (!at || editorView.state.selection.$from.depth !== 1) return false;
        event.preventDefault();
        const id = ++serial;
        const tr = editorView.state.tr.split(at.textTo);
        const composer = at.textTo + 2;
        tr.setSelection(TextSelection.create(tr.doc, composer));
        tr.setMeta(key, {
          type: "absorb",
          composer,
          turn: {
            id,
            from: at.textFrom - 1,
            to: at.textTo + 1,
            line: at.line,
            reply: "",
            stage: "absorbing",
          },
        } satisfies Meta);
        editorView.dispatch(tr);
        live = { id, requestId: `diary-${Date.now()}-${id}`, arrived: false };
        announce("absorbed");
        void ask(id, at.line);
        return true;
      },
    },
    view(editorView) {
      view = editorView;
      window.addEventListener(WALKER_ARRIVED_EVENT, onArrived);
      window.addEventListener(MAGIC_DIARY_EVENT, onDiaryEvent);
      const paper = mountDiaryPaper(editorView, options.enabled, state);
      const update = () => {
        if (!view) return;
        const current = state()!;
        paper.refresh();
        view.dom.classList.toggle(
          "magic-diary-busy",
          options.enabled() &&
            (current.active !== null || current.browsing !== null),
        );
        view.dom.setAttribute(
          "aria-busy",
          String(options.enabled() && current.active !== null),
        );
        const active = current.turns.find((t) => t.id === current.active);
        for (const el of widgets.values())
          el.classList.toggle(
            "magic-diary-reply-leaving",
            active?.stage === "leaving",
          );
        if (live && (!options.enabled() || !active)) {
          announce("leaving");
          stopRequest();
        }
      };
      update();
      return {
        update: () => update(),
        destroy() {
          paper.destroy();
          window.removeEventListener(WALKER_ARRIVED_EVENT, onArrived);
          window.removeEventListener(MAGIC_DIARY_EVENT, onDiaryEvent);
          if (live) announce("leaving");
          stopRequest();
          widgets.clear();
          view = null;
        },
      };
    },
  });
  return $prose(() => plugin);
}
