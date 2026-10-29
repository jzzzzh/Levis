import { useLayoutEffect, type RefObject } from "react";

/** Draws windowed-preview.ts's chunks as they near the panel's view, and
 *  empties them again - keeping their height - once they are far from it,
 *  so scrolling through a long document holds only a few chunks at once. */
export function useLazyChunks(
  view: RefObject<HTMLDivElement | null>,
  chunks: string[] | undefined,
  render: (markdown: string, into: HTMLElement) => void,
) {
  useLayoutEffect(() => {
    const host = view.current;
    if (!host || !chunks?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          const el = target as HTMLElement;
          const markdown = chunks[Number(el.dataset.chunk)];
          if (isIntersecting && !el.dataset.filled && markdown !== undefined) {
            el.dataset.filled = "true";
            render(markdown, el);
            el.style.height = "";
          } else if (!isIntersecting && el.dataset.filled) {
            el.style.height = `${el.offsetHeight}px`;
            el.replaceChildren();
            delete el.dataset.filled;
          }
        }
      },
      {
        root: host.closest(".workspace-preview"),
        rootMargin: "1500px 0px",
      },
    );
    for (const el of host.querySelectorAll(".workspace-lazy"))
      observer.observe(el);
    return () => observer.disconnect();
  }, [view, chunks, render]);
}
