import { useEffect, useState } from "react";
import {
  FILL_SLOT_EVENT,
  type FillSlotRequest,
} from "../../editor/fill-slots/fill-slot-plugin";

/**
 * Where the Levis layer draws around one tab's editor: the window bar's
 * slots (they come and go with the bar), the Agent surface's offset under
 * the tab bar, and a fill-in slot's card when one is clicked.
 */
export function useLevisChrome({
  paneEl,
  contentEl,
}: {
  paneEl: HTMLElement | null;
  contentEl: HTMLElement | null;
}) {
  const [barSlots, setBarSlots] = useState<{
    start: HTMLElement | null;
    end: HTMLElement | null;
  } | null>(null);
  useEffect(() => {
    const find = () => {
      const start = document.querySelector<HTMLElement>(".window-bar-start");
      const end = document.querySelector<HTMLElement>(".window-bar-end");
      setBarSlots((prev) =>
        prev?.start === start && prev?.end === end ? prev : { start, end },
      );
    };
    const shell = document.querySelector(".app-shell") ?? document.body;
    const watch = new MutationObserver(() => {
      find();
      observe();
    });
    const observe = () => {
      watch.disconnect();
      watch.observe(shell, { childList: true });
      for (const el of document.querySelectorAll(
        ".window-bar, .window-bar-status",
      ))
        watch.observe(el, { childList: true });
    };
    find();
    observe();
    return () => watch.disconnect();
  }, []);

  // The Agent surface starts under the pane's tab bar, however tall.
  useEffect(() => {
    if (!paneEl) return;
    let bar: HTMLElement | null = null;
    const sizes = new ResizeObserver(() => place());
    const place = () => {
      const next = paneEl.querySelector<HTMLElement>(":scope > .tab-bar");
      if (next !== bar) {
        if (bar) sizes.unobserve(bar);
        if (next) sizes.observe(next);
        bar = next;
      }
      paneEl.style.setProperty(
        "--agent-top",
        `${bar ? bar.offsetHeight : 28}px`,
      );
    };
    place();
    const children = new MutationObserver(place);
    children.observe(paneEl, { childList: true });
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, [paneEl]);

  const [fillRequest, setFillRequest] = useState<FillSlotRequest | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      if (!contentEl?.contains(event.target as Node)) return;
      setFillRequest((event as CustomEvent<FillSlotRequest>).detail);
    };
    window.addEventListener(FILL_SLOT_EVENT, open);
    return () => window.removeEventListener(FILL_SLOT_EVENT, open);
  }, [contentEl]);

  return {
    barSlots,
    fillRequest,
    closeFill: () => setFillRequest(null),
  };
}
