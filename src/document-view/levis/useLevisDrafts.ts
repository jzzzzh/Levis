import { useEffect, useMemo, useRef, useState } from "react";
import { editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import type { EditorRunner } from "../../editor/useEditorRunner";
import type { AgentConversation } from "../../ai/chat/useAgentConversation";
import type { EditProposal } from "../../ai/types";
import { generatedIdsIn } from "../../ai/revision/generated-images";
import type { StreamEvent } from "../../platform/ipc";
import type { ProposalRouterRef } from "../levis-proposal-router";
import { useWorkspacePersistence } from "../useWorkspacePersistence";
import type { LevisSurface } from "./useLevisSurface";
import { onDocChange } from "./doc-changes";

const noImages = async () => {};

/** A proposal upstream's own picture flow owns: a generated picture, or
 *  text carrying one. The Agent's draft takes text only. */
const ownedUpstream = (proposal: EditProposal) =>
  !!proposal.image || generatedIdsIn(proposal.text ?? "").length > 0;

/**
 * The Agent's draft for one tab: proposals routed into it while a task
 * runs from the Agent surface, deciding them (whole, by paragraph, or a
 * rejected one after all), the live preview, and keeping the draft across
 * launches.
 */
export function useLevisDrafts({
  run,
  tabId,
  documentId,
  filePath,
  surface,
  conversation,
  router,
  isActive,
  recoveryEnabled,
  language,
}: {
  run: EditorRunner;
  tabId: string;
  documentId: string;
  filePath: string | null;
  surface: LevisSurface;
  conversation: AgentConversation;
  router: ProposalRouterRef;
  isActive: boolean;
  recoveryEnabled: boolean;
  language: string;
}) {
  const { workspace } = surface;

  // Proposals of the main conversation go to the draft while the workspace
  // routes them; generated pictures stay with upstream's previews.
  const imageCalls = useRef(new Set<string>());
  router.current = {
    onEvent: (event: StreamEvent) => {
      if (event.type === "picture") return false;
      if (event.type === "toolStart" && event.name === "generate_image")
        imageCalls.current.add(event.callId);
      const callId =
        event.type === "toolStart" || event.type === "toolArgsDelta"
          ? event.callId
          : event.type === "turn" && "call_id" in event.turn
            ? event.turn.call_id
            : null;
      if (callId && imageCalls.current.has(callId)) return false;
      if (event.type === "retry") {
        workspace.onEvent(event);
        return false;
      }
      return workspace.onEvent(event);
    },
    receive: (proposals) =>
      !proposals.some((p) => ownedUpstream(p.proposal)) &&
      workspace.receive(proposals),
    panelSend: workspace.endRouting,
    statuses: workspace.statuses,
  };

  const recovery = useWorkspacePersistence({
    workspace,
    conversation,
    run,
    documentId,
    tabId,
    path: filePath,
    enabled: recoveryEnabled,
    language,
    imagePending: false,
    stopImages: noImages,
  });
  const finishWorkspace = workspace.finish;
  const failed = !!conversation.error;
  useEffect(() => {
    // A failed stream offers Retry; keeping its partial proposal would
    // duplicate the retried one.
    if (!conversation.busy) finishWorkspace(failed ? "failed" : "stopped");
  }, [conversation.busy, finishWorkspace, failed]);

  // The document as the Agent's preview shows it while there is no draft:
  // read again on each change while the Agent is on screen.
  const hasDraftOperations = !!workspace.draft?.operations.length;
  const visible = workspace.open && isActive;
  const [docVersion, setDocVersion] = useState(0);
  useEffect(() => {
    if (!visible) return;
    return onDocChange(tabId, () => setDocVersion((n) => n + 1));
  }, [visible, tabId]);
  const documentMarkdown = useMemo(
    () =>
      visible && !hasDraftOperations
        ? (run((ctx) =>
            ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc),
          ) ?? "")
        : "",
    // docVersion and the history: read again after either changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, hasDraftOperations, run, conversation.history, docVersion],
  );

  const acceptedCount = useRef(0);
  const acceptDraft = (callId?: string) => {
    if (workspace.accept(callId)) acceptedCount.current++;
  };
  const rejectDraft = (callId?: string) => workspace.discard(callId);
  const decidePart = (callId: string, part: number, take: boolean) => {
    let id = callId;
    if (part >= 0) {
      const parts = workspace.explode(callId);
      if (!parts.length) return;
      id = parts[part] ?? callId;
    }
    if (take) acceptDraft(id);
    else rejectDraft(id);
  };
  const undoReject = (callId: string) => {
    const op = workspace.rejected.find((o) => o.callId === callId);
    if (op)
      workspace.undoReject(callId, op.proposal, conversation.conversationId);
  };
  const restoreChange = (callId: string, proposal: EditProposal) => {
    if (workspace.reinstate(callId, proposal, conversation.conversationId))
      acceptedCount.current++;
  };

  return {
    recovery,
    documentMarkdown,
    hasDraftOperations,
    visible,
    acceptedCount,
    acceptDraft,
    rejectDraft,
    decidePart,
    undoReject,
    restoreChange,
  };
}

export type LevisDrafts = ReturnType<typeof useLevisDrafts>;
