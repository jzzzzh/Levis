import type { EditorView } from "@milkdown/kit/prose/view";
import type { DiaryState } from "./diary-state";

/** The page around the diary: a caret of its own beside the text, a click
 *  on the paper focusing the composer, and the passage scaled to fit the
 *  pane. `refresh` after each editor update; `destroy` with the view. */
export function mountDiaryPaper(
  editorView: EditorView,
  enabled: () => boolean,
  state: () => DiaryState | undefined,
) {
  const view = editorView;
  const pane = editorView.dom.closest<HTMLElement>(".editor-scroll");
  const column = editorView.dom.closest<HTMLElement>(".editor-content");
  const paper = editorView.dom.closest<HTMLElement>(".milkdown");
  let frame = 0;
  let autofocus = true;
  let wasEnabled = enabled();
  // Kept outside contenteditable: WebKit's caret can stop blinking while
  // idle, and inserting a caret widget in the text interferes with IME.
  const caret = document.createElement("div");
  caret.className = "magic-diary-input-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.hidden = true;
  document.body.appendChild(caret);
  const updateCaret = () => {
    const current = state();
    const ready =
      enabled() &&
      current?.active === null &&
      current.browsing === null &&
      view.state.selection.empty &&
      !view.dom.closest('[data-active-tab="false"]') &&
      view.dom.getBoundingClientRect().width > 0;
    caret.hidden = !ready;
    view.dom.classList.toggle("magic-diary-has-caret", ready);
    if (!ready) return;
    try {
      const box = view.coordsAtPos(view.state.selection.head);
      caret.style.left = `${box.left}px`;
      caret.style.top = `${box.top + 2}px`;
      caret.style.height = `${Math.max(12, box.bottom - box.top - 4)}px`;
    } catch {
      caret.hidden = true;
      view.dom.classList.remove("magic-diary-has-caret");
    }
  };
  const onPaperPointerDown = (event: PointerEvent) => {
    if (!enabled() || state()?.active !== null || state()?.browsing !== null)
      return;
    if (
      event.target === pane ||
      event.target === column ||
      event.target === paper
    ) {
      event.preventDefault();
      view.focus();
      updateCaret();
    }
  };
  pane?.addEventListener("pointerdown", onPaperPointerDown);
  // Fit the entire passage, including at large editor zoom, rather than
  // turning the answer into a nested scroll area or clipping its end.
  const fit = () => {
    frame = 0;
    if (!pane || !column || !paper) return;
    if (autofocus) {
      if (
        enabled() &&
        document.activeElement === document.body &&
        !view.dom.closest('[data-active-tab="false"]') &&
        !document.querySelector('[role="dialog"]')
      )
        view.focus();
      autofocus = false;
    }
    if (!enabled()) {
      paper.style.removeProperty("--diary-fit");
      updateCaret();
      return;
    }
    if (!pane.clientHeight) return;
    const style = getComputedStyle(column);
    const available = Math.max(
      40,
      pane.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom),
    );
    paper.style.setProperty("--diary-fit", "1");
    let scale = 1;
    for (let i = 0; i < 6; i++) {
      const height = view.dom.getBoundingClientRect().height;
      if (height <= available) break;
      scale *= Math.min(0.9, available / height);
      paper.style.setProperty("--diary-fit", String(scale));
    }
    updateCaret();
  };
  const scheduleFit = () => {
    if (!frame && pane) frame = requestAnimationFrame(fit);
  };
  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleFit);
  observer?.observe(editorView.dom);
  if (pane) observer?.observe(pane);
  scheduleFit();
  return {
    refresh() {
      if (enabled() && !wasEnabled) autofocus = true;
      wasEnabled = enabled();
      updateCaret();
      scheduleFit();
    },
    destroy() {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      caret.remove();
      pane?.removeEventListener("pointerdown", onPaperPointerDown);
      view.dom.classList.remove("magic-diary-has-caret");
      paper?.style.removeProperty("--diary-fit");
    },
  };
}
