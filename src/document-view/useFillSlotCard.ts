import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { EditorRunner } from "../editor/useEditorRunner";
import type { Settings } from "../prefs/SettingsContext";
import { suggestFill } from "../ai/workspace/assist";
import type { FillSlotRequest } from "../editor/fill-slots/fill-slot-plugin";

/** The text model's suggestions for a blank, from the document around it:
 *  null while they come, empty when there are none (`failed`: none came). */
export function useFillSuggestions(
  request: FillSlotRequest,
  run: EditorRunner,
  settings: Settings,
) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const context = run((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { doc } = view.state;
      const at = Math.min(request.from, doc.content.size);
      return {
        markdown: ctx.get(serializerCtx)(doc),
        paragraph: doc.resolve(at).parent.textContent,
      };
    });
    if (!context) return;
    void suggestFill(
      settings,
      context.markdown,
      request.label,
      context.paragraph,
    )
      .then((found) => live && setOptions(found))
      .catch(() => {
        if (!live) return;
        setFailed(true);
        setOptions([]);
      });
    return () => {
      live = false;
    };
    // Once per opened blank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  return { options, failed };
}

/** Closes the card on Escape or a click outside it; returns the card's ref. */
export function useDismiss(onClose: () => void) {
  const card = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    const outside = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node)) close.current();
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, []);
  return card;
}

/** Under the blank, kept inside the window. */
export function useCardPlace(
  card: RefObject<HTMLDivElement | null>,
  request: FillSlotRequest,
  options: string[] | null,
) {
  const [place, setPlace] = useState({ left: request.rect.left, top: 0 });
  useLayoutEffect(() => {
    const width = card.current?.offsetWidth ?? 300;
    const height = card.current?.offsetHeight ?? 180;
    const left = Math.max(
      8,
      Math.min(request.rect.left, window.innerWidth - width - 8),
    );
    const below = request.rect.bottom + 6;
    const top =
      below + height > window.innerHeight - 8
        ? Math.max(8, request.rect.top - height - 6)
        : below;
    setPlace({ left, top });
  }, [card, request, options]);
  return place;
}
