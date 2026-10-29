import type { MouseEvent } from "react";
import type { DocumentDraft, DraftOperation } from "./document-draft";
import type { EditProposal } from "../types";
import type { workspaceLabels } from "./labels";
import { ChevronIcon } from "../../ui/icons";
import { useDraftDocument } from "./useDraftDocument";

type Labels = ReturnType<typeof workspaceLabels>;

interface DecisionHandlers {
  onAccept: (callId?: string) => void;
  onReject: (callId?: string) => void;
  onDecidePart?: (callId: string, part: number, take: boolean) => void;
  onUndoReject?: (callId: string) => void;
}

/** The document panel's clicks: its markup's own buttons (draft-diff.ts) -
 *  each change's 采纳 / 不采纳, a paragraph's, and a rejected one's 恢复. */
function onDocumentClick(
  event: MouseEvent,
  conflict: boolean,
  { onAccept, onReject, onDecidePart, onUndoReject }: DecisionHandlers,
) {
  // Each change's own 采纳 / 不采纳 (draft-diff.ts): markup too.
  const change = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-change-action]",
  );
  const call = change?.dataset.call;
  if (call) {
    if (change.dataset.changeAction === "reject") onReject(call);
    else if (!conflict) onAccept(call);
    return;
  }
  // One paragraph of a change, and a rejected one's 恢复.
  const part = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-part-action]",
  );
  if (part?.dataset.call) {
    const take = part.dataset.partAction === "accept";
    if (!take || !conflict)
      onDecidePart?.(part.dataset.call, Number(part.dataset.part ?? -1), take);
    return;
  }
  const back = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-restore]",
  );
  if (back?.dataset.restore) onUndoReject?.(back.dataset.restore);
}

/** The draft's changes listed one by one, the skipped ones folded with 采纳,
 *  and 全部采纳 / 全部拒绝. */
function WorkspaceChanges({
  labels,
  pending,
  rejected,
  conflict,
  isSettled,
  targets,
  onAccept,
  onReject,
  onRestore,
}: {
  labels: Labels;
  pending: DraftOperation[];
  rejected: DraftOperation[];
  conflict: boolean;
  isSettled: (callId: string) => boolean;
  /** How many changes 全部 covers. */
  targets: number;
  onAccept: (callId?: string) => void;
  onReject: (callId?: string) => void;
  onRestore?: (callId: string, proposal: EditProposal) => void;
}) {
  // Deciding does not wait for the Agent to finish talking - only for the
  // text itself to have arrived.
  const anySettled = pending.some((op) => isSettled(op.callId));
  return (
    <>
      <details className="workspace-changes">
        <summary>
          {labels.changes} ({pending.length})
          {rejected.length > 0 && (
            <span className="workspace-changes-skipped">
              {" · "}
              {labels.skippedCount(rejected.length)}
            </span>
          )}
        </summary>
        {pending.map(({ callId, proposal }) => (
          <article key={callId}>
            <strong>
              {proposal.reason ||
                proposal.text?.split("\n")[0] ||
                proposal.action}
            </strong>
            {proposal.anchor && <blockquote>{proposal.anchor}</blockquote>}
            <pre>{proposal.text}</pre>
            <div className="workspace-change-actions">
              <button
                className="workspace-button"
                disabled={conflict || !isSettled(callId)}
                onClick={() => onAccept(callId)}
              >
                {labels.take}
              </button>
              <button
                className="workspace-button is-quiet"
                disabled={!isSettled(callId)}
                onClick={() => onReject(callId)}
              >
                {labels.skip}
              </button>
            </div>
          </article>
        ))}
        {/* Skipped, not gone ("万一后悔"): folded, with 采纳. */}
        {rejected.map(({ callId, proposal }) => (
          <article key={callId} className="is-skipped">
            <strong>
              {proposal.reason ||
                proposal.text?.split("\n")[0] ||
                proposal.action}
            </strong>
            <div className="workspace-change-actions">
              <span className="workspace-change-state">{labels.skipped}</span>
              {onRestore && (
                <button
                  className="workspace-button"
                  onClick={() => onRestore(callId, proposal)}
                >
                  {labels.take}
                </button>
              )}
            </div>
          </article>
        ))}
      </details>
      {pending.length > 0 && (
        <div className="workspace-review-actions">
          <button
            className="workspace-button is-primary"
            aria-label={labels.accept}
            disabled={conflict || !anySettled}
            onClick={() => onAccept()}
          >
            {labels.accept}
            {targets > 1 && (
              <span className="workspace-review-count" aria-hidden>
                {targets}
              </span>
            )}
          </button>
          <button
            className="workspace-button"
            aria-label={labels.reject}
            disabled={!anySettled}
            onClick={() => onReject()}
          >
            {labels.reject}
            {targets > 1 && (
              <span className="workspace-review-count" aria-hidden>
                {targets}
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
}

/** The workspace's document panel: the document as it is, or the draft
 *  waiting to be reviewed. */
export function WorkspacePreview({
  labels,
  open,
  onCollapse,
  documentPath,
  draft,
  preview,
  conflict,
  rejected,
  isSettled,
  onRestore,
  ...handlers
}: DecisionHandlers & {
  labels: Labels;
  open: boolean;
  onCollapse: () => void;
  documentPath: string | null;
  draft: DocumentDraft | null;
  preview: string;
  conflict: boolean;
  rejected: DraftOperation[];
  isSettled: (callId: string) => boolean;
  onRestore?: (callId: string, proposal: EditProposal) => void;
}) {
  const pending = draft?.operations ?? [];
  const {
    documentView,
    draftPreview,
    marked,
    changeTargets,
    changeAt,
    showChange,
  } = useDraftDocument({
    documentPath,
    draft,
    preview,
    rejected,
    labels,
  });
  return (
    <div
      className={`workspace-preview ${open ? "has-draft" : "document-card"}`}
      aria-hidden={!open}
      inert={!open}
    >
      <header>
        <strong>{pending.length ? labels.preview : labels.current}</strong>
        {pending.length > 0 && (
          <span className="workspace-count" key={pending.length}>
            {pending.length}
          </span>
        )}
        <span className="workspace-header-spacer" />
        <button
          className="workspace-icon-button workspace-collapse"
          aria-label={labels.collapse}
          title={labels.collapse}
          onClick={onCollapse}
        >
          <ChevronIcon />
        </button>
      </header>
      <p className="workspace-hint">{labels.saved}</p>
      {conflict && (
        <p className="workspace-conflict" role="alert">
          {labels.conflict}
        </p>
      )}
      {marked && marked.changes > 0 && (
        <div className="workspace-change-nav" role="group">
          <span>{labels.changeCount(marked.changes)}</span>
          <button
            type="button"
            className="workspace-icon-button"
            aria-label={labels.previousChange}
            title={labels.previousChange}
            onClick={() => showChange(changeAt - 1)}
          >
            <ChevronIcon className="is-up" />
          </button>
          <button
            type="button"
            className="workspace-icon-button"
            aria-label={labels.nextChange}
            title={labels.nextChange}
            onClick={() => showChange(changeAt + 1)}
          >
            <ChevronIcon className="is-down" />
          </button>
        </div>
      )}
      <div
        className="workspace-document"
        ref={documentView}
        onClick={(event) => onDocumentClick(event, conflict, handlers)}
      >
        <div
          className={`agent-markdown${draftPreview ? " draft-document" : ""}`}
          dangerouslySetInnerHTML={marked.inner}
        />
      </div>
      {(pending.length > 0 || rejected.length > 0) && (
        <WorkspaceChanges
          labels={labels}
          pending={pending}
          rejected={rejected}
          conflict={conflict}
          isSettled={isSettled}
          targets={changeTargets.length}
          onAccept={handlers.onAccept}
          onReject={handlers.onReject}
          onRestore={onRestore}
        />
      )}
    </div>
  );
}
