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
import { LARGE_PREVIEW } from "../../ai/workspace/windowed-preview";
import { onDocChange } from "./doc-changes";

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
  initialValue,
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
  /** The document as the tab opened it. */
  initialValue: string;
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
  });
  const finishWorkspace = workspace.finish;
  const failed = !!conversation.error;
  useEffect(() => {
    // A failed stream offers Retry; keeping its partial proposal would
    // duplicate the retried one.
    if (!conversation.busy) finishWorkspace(failed ? "failed" : "stopped");
  }, [conversation.busy, finishWorkspace, failed]);

  // The document as the Agent's preview shows it while there is no draft:
  // read when the Agent comes on screen, then taken from each change the
  // editor reports - serializing a long document again on every change
  // cost more than the typing itself.
  const hasDraftOperations = !!workspace.draft?.operations.length;
  const visible = workspace.open && isActive;
  // A report taken before the history last changed may be behind it.
  const history = conversation.history;
  const historyRef = useRef(history);
  historyRef.current = history;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const lastReport = useRef<string | null>(null);
  const [reported, setReported] = useState<{
    markdown: string;
    history: unknown;
  } | null>(null);
  useEffect(
    () =>
      onDocChange(tabId, (markdown) => {
        lastReport.current = markdown;
        if (visibleRef.current)
          setReported({ markdown, history: historyRef.current });
      }),
    [tabId],
  );
  useEffect(() => {
    if (!visible) setReported(null);
  }, [visible]);
  const documentMarkdown = useMemo(() => {
    if (!visible || hasDraftOperations) return "";
    if (reported && reported.history === history) return reported.markdown;
    // Serializing a very long document takes seconds (14 s at 5M
    // characters): its last report stands in, or the file as it opened,
    // until the editor reports again.
    const read = run((ctx) => {
      const { doc } = ctx.get(editorViewCtx).state;
      return doc.content.size > LARGE_PREVIEW
        ? null
        : ctx.get(serializerCtx)(doc);
    });
    return read ?? lastReport.current ?? initialValue;
  }, [visible, hasDraftOperations, run, history, reported, initialValue]);

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
