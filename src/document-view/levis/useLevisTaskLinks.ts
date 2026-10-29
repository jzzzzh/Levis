import { useEffect } from "react";
import { editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { EditorRunner } from "../../editor/useEditorRunner";
import type { AgentConversation } from "../../ai/chat/useAgentConversation";
import {
  findConversation,
  rememberConversationDocument,
} from "../../ai/chat/chat-history";
import {
  pendingTaskRestores,
  RESTORE_TASK_EVENT,
  REWRITE_IMAGE_SRCS_EVENT,
  setTabEngaged,
  type RewriteImageSrcs,
} from "../../document/levis-tabs";
import { decodeUrlPath } from "../../utils/path";
import { useLatest } from "../../utils/hooks/useLatest";

/**
 * What ties one tab's document to its Agent work outside the editor: the
 * saved conversation remembers the document, a past task reopened here
 * comes back, Save As moves pictures without a remount, and File > Open
 * leaves a tab with Agent work alone.
 */
export function useLevisTaskLinks({
  run,
  tabId,
  documentId,
  filePath,
  filePathRef,
  conversation,
  engaged,
  enabled,
  showAgent,
}: {
  run: EditorRunner;
  tabId: string;
  documentId: string;
  filePath: string | null;
  filePathRef: { readonly current: string | null };
  conversation: AgentConversation;
  /** A conversation, a draft or a running task is here. */
  engaged: boolean;
  /** Not on the tour's practice tab. */
  enabled: boolean;
  showAgent: () => void;
}) {
  // Save As copied this document's images next to it: point the image
  // nodes at their new paths without remounting (useSaveTabs).
  useEffect(() => {
    const rewrite = (event: Event) => {
      const detail = (event as CustomEvent<RewriteImageSrcs>).detail;
      if (detail.tabId !== tabId) return;
      const moved = new Map<string, string>();
      for (const { old, new: next } of detail.mappings) {
        moved.set(old, next);
        moved.set(decodeUrlPath(old), next);
      }
      // The new srcs are relative to the new location, and the image views
      // resolve them as they redraw - before the new path comes down as a
      // prop.
      (filePathRef as { current: string | null }).current = detail.docPath;
      const done = run((ctx) => {
        const view = ctx.get(editorViewCtx);
        const tr = view.state.tr;
        view.state.doc.descendants((node, pos) => {
          if (node.type.name !== "image") return;
          const next = moved.get(node.attrs.src as string);
          if (next)
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: next });
        });
        if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false));
        return true;
      });
      if (done) detail.handled = true;
    };
    window.addEventListener(REWRITE_IMAGE_SRCS_EVENT, rewrite);
    return () => window.removeEventListener(REWRITE_IMAGE_SRCS_EVENT, rewrite);
  }, [tabId, run, filePathRef]);

  // The saved conversation remembers its document once an exchange has
  // settled: by identity, and an untitled one by its text.
  const historyLength = conversation.history.length;
  const conversationId = conversation.conversationId;
  const settled = !conversation.busy;
  useEffect(() => {
    if (!settled || historyLength === 0 || !enabled) return;
    const timer = setTimeout(() => {
      const text = filePath
        ? null
        : run((ctx) =>
            ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc),
          );
      void rememberConversationDocument(
        conversationId,
        documentId,
        text?.trim() ? text : null,
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [
    settled,
    historyLength,
    conversationId,
    documentId,
    filePath,
    run,
    enabled,
  ]);

  // A task opened from the history list for this document (App routed it
  // here): its conversation comes back, on the Agent surface.
  const restoreConversation = conversation.restore;
  const showAgentRef = useLatest(showAgent);
  useEffect(() => {
    const check = () => {
      const key = [`path:${filePath}`, `doc:${documentId}`].find((k) =>
        pendingTaskRestores.has(k),
      );
      if (!key) return;
      const id = pendingTaskRestores.get(key)!;
      pendingTaskRestores.delete(key);
      void findConversation(id).then((entry) => {
        if (!entry) return;
        restoreConversation(entry.id, entry.turns);
        showAgentRef.current();
      });
    };
    check();
    window.addEventListener(RESTORE_TASK_EVENT, check);
    return () => window.removeEventListener(RESTORE_TASK_EVENT, check);
  }, [filePath, documentId, restoreConversation, showAgentRef]);

  // File > Open doesn't replace this tab while it holds Agent work.
  useEffect(() => {
    setTabEngaged(tabId, engaged);
  }, [tabId, engaged]);
  useEffect(() => () => setTabEngaged(tabId, false), [tabId]);
}
