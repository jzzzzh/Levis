import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  resolveImageSrc,
  showDocImage,
} from "../../editor/images/image-plugin";
import { isScopedUrl } from "../../platform/ios-files";
import { withImageSrc } from "../markdown-image-src";
import { renderDocumentHtml } from "../../editor/markdown/render-html";
import { useKatexReady } from "../../editor/math/katex-loader";
import type { DocumentDraft, DraftOperation } from "./document-draft";
import {
  markDraftChanges,
  withChangeActions,
  type ChangeTarget,
  type DraftChanges,
} from "./draft-diff";
import type { workspaceLabels } from "./labels";
import { useLazyChunks } from "./useLazyChunks";
import {
  LARGE_PREVIEW,
  lazyImages,
  windowedPreview,
  type WindowedPreview,
} from "./windowed-preview";

/** Changes whose paragraphs can be taken one at a time: text added at
 *  the end (useDocumentWorkspace's explode says why only that). */
const INSERTS = new Set(["append"]);

/** Where each pending change sits in the marked document - the text of
 *  the blocks it writes (a deletion: the passage it removes) - with its
 *  paragraphs, and those of them already rejected. */
function changeTargetsOf(
  pendingOps: DraftOperation[] | undefined,
  rejected: DraftOperation[],
): ChangeTarget[] {
  const blockTexts = (markdown: string) => {
    const template = document.createElement("template");
    template.innerHTML = renderDocumentHtml(markdown);
    return [...template.content.children].map((el) => el.textContent ?? "");
  };
  const groups = new Map<string, ChangeTarget>();
  for (const { callId, proposal, parent } of pendingOps ?? []) {
    const id = parent ?? callId;
    const target = groups.get(id) ?? {
      callId: id,
      parts: [],
      splittable: INSERTS.has(proposal.action),
    };
    groups.set(id, target);
    const source =
      proposal.action === "delete"
        ? (proposal.anchor ?? "")
        : (proposal.text ?? "");
    if (parent) target.parts.push({ call: callId, part: -1, text: source });
    else
      blockTexts(source).forEach((text, part) =>
        target.parts.push({ call: callId, part, text }),
      );
  }
  for (const op of rejected) {
    const target = op.parent ? groups.get(op.parent) : undefined;
    if (!target || op.part === undefined || !op.parts) continue;
    // After the nearest earlier paragraph still on show.
    let after = "";
    for (let j = op.part - 1; j >= 0 && !after; j--) {
      const shown = target.parts.find((p) => p.call === `${op.parent}::${j}`);
      if (shown) after = blockTexts(shown.text)[0] ?? "";
    }
    (target.rejected ??= []).push({
      call: op.callId,
      part: op.part,
      html: renderDocumentHtml(op.proposal.text ?? ""),
      after,
    });
  }
  return [...groups.values()];
}

/** The document panel's rendering: the document as it is, or the draft with
 *  its changes marked against it, and a way to step through those changes. */
export function useDraftDocument({
  documentPath,
  draft,
  preview,
  rejected,
  labels,
}: {
  documentPath: string | null;
  draft: DocumentDraft | null;
  preview: string;
  rejected: DraftOperation[];
  labels: ReturnType<typeof workspaceLabels>;
}) {
  // The document panel renders the markdown itself: its pictures' paths
  // (relative to the document's folder, or absolute for an unsaved one)
  // resolve as the editor's do, or the webview would load nothing. A
  // document picked in Files (iOS) reads them asynchronously instead.
  const shownDocument = preview || draft?.baseMarkdown || "";
  const scoped = !!documentPath && isScopedUrl(documentPath);
  const imageSrc = useCallback(
    (src: string) => resolveImageSrc(src, documentPath),
    [documentPath],
  );
  const documentView = useRef<HTMLDivElement>(null);
  // While a draft waits, the panel marks what it changes against the
  // document as it is (draft-diff.ts) - where a paragraph goes, which words
  // a rewrite changes - instead of showing the finished text alone.
  // At a lower priority than typing and animation: a streamed proposal
  // updates the draft several times a second, and each update renders the
  // whole document. The document as it is changes far less often.
  const katexReady = useKatexReady();
  const draftPreview = useDeferredValue(
    draft?.operations.length ? preview : "",
  );
  const baseMarkdown = draft?.baseMarkdown ?? "";
  // A very long document is windowed (windowed-preview.ts): drawn whole,
  // it took the renderer down.
  const large =
    shownDocument.length > LARGE_PREVIEW || baseMarkdown.length > LARGE_PREVIEW;
  const baseHtml = useMemo(
    () => (large ? "" : renderDocumentHtml(baseMarkdown)),
    // katexReady: formulas render once KaTeX is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseMarkdown, large, katexReady],
  );
  // One rendering for the document and the draft, the draft's changes
  // marked.
  const pendingOps = draft?.operations;
  const changeTargets = useMemo(
    () => changeTargetsOf(pendingOps, rejected),
    [pendingOps, rejected],
  );
  const marked = useMemo(() => {
    const { html, changes, chunks }: Partial<WindowedPreview> & DraftChanges =
      large
        ? windowedPreview(
            draftPreview ? baseMarkdown : null,
            draftPreview || shownDocument,
          )
        : draftPreview
          ? markDraftChanges(baseHtml, renderDocumentHtml(draftPreview))
          : { html: renderDocumentHtml(shownDocument), changes: 0 };
    return {
      changes,
      chunks,
      inner: {
        __html: lazyImages(
          withImageSrc(
            withChangeActions(html, draftPreview ? changeTargets : [], {
              accept: labels.take,
              reject: labels.dontTake,
              acceptPart: labels.takePart,
              rejectPart: labels.dontTakePart,
              restore: labels.restore,
            }),
            scoped ? undefined : imageSrc,
          ),
        ),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftPreview,
    large,
    baseMarkdown,
    baseHtml,
    shownDocument,
    changeTargets,
    imageSrc,
    scoped,
    katexReady,
  ]);
  const renderChunk = useCallback(
    (markdown: string, into: HTMLElement) => {
      into.innerHTML = lazyImages(
        withImageSrc(
          renderDocumentHtml(markdown),
          scoped ? undefined : imageSrc,
        ),
      );
      if (scoped)
        for (const img of into.querySelectorAll("img")) {
          const src = img.getAttribute("src");
          if (src) showDocImage(img, src, documentPath);
        }
    },
    // katexReady: formulas render once KaTeX is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, imageSrc, documentPath, katexReady],
  );
  useLazyChunks(documentView, marked.chunks, renderChunk);
  const [changeAt, setChangeAt] = useState(-1);
  /** Scrolls the panel to change `index` (wrapping) and flashes it. */
  const showChange = (index: number) => {
    const panel =
      documentView.current?.closest<HTMLElement>(".workspace-preview");
    const all = [
      ...(documentView.current?.querySelectorAll<HTMLElement>(
        ".draft-added, .draft-changed, .draft-removed",
      ) ?? []),
    ];
    if (!panel || !all.length) return;
    const at = ((index % all.length) + all.length) % all.length;
    const el = all[at];
    setChangeAt(at);
    panel.scrollTo({
      top:
        panel.scrollTop +
        el.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        panel.clientHeight * 0.25,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    el.classList.remove("draft-focus");
    // Restart the flash on a repeated jump to the same place.
    void el.offsetWidth;
    el.classList.add("draft-focus");
  };
  // A draft's first changes come into view on their own.
  const hadChanges = useRef(false);
  useEffect(() => {
    const has = !!marked?.changes;
    if (has && !hadChanges.current) requestAnimationFrame(() => showChange(0));
    if (!has) setChangeAt(-1);
    hadChanges.current = has;
  }, [marked]);
  useLayoutEffect(() => {
    if (!scoped) return;
    for (const img of documentView.current?.querySelectorAll("img") ?? []) {
      const src = img.getAttribute("src");
      if (src && !img.dataset.docSrc) showDocImage(img, src, documentPath);
    }
  }, [scoped, shownDocument, documentPath]);
  return {
    documentView,
    draftPreview,
    marked,
    changeTargets,
    changeAt,
    showChange,
  };
}
