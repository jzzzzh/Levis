import type { EditProposal } from "../ai/types";
import type { PendingStatus } from "../ai/revision/usePendingEdits";
import type { StreamEvent } from "../platform/ipc";

/**
 * Levis: the Agent workspace takes the main conversation's proposals into
 * its own draft instead of the document's green previews while a task runs
 * from the Agent surface (useDocumentWorkspace). useEditorProposals asks the
 * router first; an empty router changes nothing.
 */
export interface ProposalRouter {
  /** True when the workspace took the event. */
  onEvent: (event: StreamEvent) => boolean;
  /** True when the workspace took the proposals. */
  receive: (proposals: { callId: string; proposal: EditProposal }[]) => boolean;
  /** The docked panel is sending: its proposals go to the document. */
  panelSend: () => void;
  /** The workspace's decisions, for the conversation's history. */
  statuses: Record<string, PendingStatus>;
}

export type ProposalRouterRef = { current: ProposalRouter | null };

/** Whether the workspace took these proposals; a plain function, so the
 *  callers' memoization doesn't depend on the router's contents. */
export function routedToWorkspace(
  router: ProposalRouterRef | undefined,
  proposals: { callId: string; proposal: EditProposal }[],
): boolean {
  return router?.current?.receive(proposals) ?? false;
}

/** Whether the workspace took this stream event. */
export function eventToWorkspace(
  router: ProposalRouterRef | undefined,
  event: StreamEvent,
): boolean {
  return router?.current?.onEvent(event) ?? false;
}
