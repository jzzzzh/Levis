import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { splitImageTitle } from "./image-rotation";
import "./image-extras.css";

/**
 * What an image's node view (image-plugin.ts) adds on top of the picture:
 * its quarter turn, and a fade in when a new picture arrives. Turning,
 * widths and a generated picture's prompt are in its context menu
 * (editor-menu-image-view.ts); opening it large is the zoom corner.
 */

export function imageExtras(dom: HTMLElement, img: HTMLImageElement) {
  // A quarter turn swaps the footprint: the wrapper takes the turned aspect
  // ratio once the picture's own is known.
  const ratio = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    dom.style.setProperty(
      "--image-ratio",
      String(img.naturalWidth / img.naturalHeight),
    );
    // Turned and unsized: as wide as the picture is tall.
    dom.style.setProperty("--image-turned-width", `${img.naturalHeight}px`);
  };
  const loaded = () => dom.classList.remove("image-view-loading");
  img.addEventListener("load", () => {
    ratio();
    loaded();
  });
  img.addEventListener("error", loaded);
  let src: string | null = null;

  return {
    /** Called by the node view after it has shown `node`. */
    apply(node: ProseNode) {
      const nextSrc = (node.attrs.src as string) ?? "";
      if (nextSrc !== src) {
        src = nextSrc;
        dom.classList.add("image-view-loading");
        // A cached picture is complete at once and just shows.
        queueMicrotask(() => {
          if (img.complete) loaded();
        });
      }
      const { rotate } = splitImageTitle(node.attrs.title as string);
      dom.dataset.rotate = String(rotate);
      dom.classList.toggle(
        "image-view-turned",
        rotate === 90 || rotate === 270,
      );
      ratio();
    },
  };
}
