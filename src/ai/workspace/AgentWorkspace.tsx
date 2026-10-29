import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DocumentDraft, DraftOperation } from "./document-draft";
import type { EditProposal } from "../types";
import type { AgentConversation } from "../chat/useAgentConversation";
import type { PendingImage } from "./draft-diff";
import { workspaceLabels } from "./labels";
import { HamburgerIcon, PlusIcon } from "../../ui/icons";
import type { Suggestion } from "./assist";
import { NEW_DOCUMENT_EVENT } from "../../document/levis-tabs";
import { fillComposer, workspaceOutline } from "./workspace-outline";
import { WorkspaceTasks } from "./WorkspaceTasks";
import { WorkspacePreview } from "./WorkspacePreview";
import { useColumnGlide, useTasksPanel } from "./useWorkspaceLayout";
import "./workspace.css";

const NO_PENDING_IMAGES: PendingImage[] = [];
const NO_REJECTED: DraftOperation[] = [];
const ALWAYS_SETTLED = () => true;

export function AgentWorkspace({
  language,
  documentPath,
  draft,
  preview,
  conflict,
  conversation,
  children,
  onAccept,
  onReject,
  onImageAccept,
  onImageReject,
  rejected = NO_REJECTED,
  onRestore,
  onDecidePart,
  onUndoReject,
  isSettled = ALWAYS_SETTLED,
  tools,
  mediaPreview,
  pendingMedia = false,
  onStop,
  toolLabels = {},
  documentId,
  suggestions,
  aiSuggestions = false,
  autoWriter,
  pendingImages = NO_PENDING_IMAGES,
}: {
  language: string;
  documentPath: string | null;
  draft: DocumentDraft | null;
  preview: string;
  conflict: boolean;
  conversation: AgentConversation;
  children: ReactNode;
  onAccept: (callId?: string) => void;
  onReject: (callId?: string) => void;
  /** A finished picture shown in the draft: put in (with its paragraph)
   *  or dropped. */
  onImageAccept?: (jobId: string) => void;
  onImageReject?: (jobId: string) => void;
  /** This task's rejected changes, listed with 采纳 so one can be taken
   *  after all (onRestore). */
  rejected?: DraftOperation[];
  onRestore?: (callId: string, proposal: EditProposal) => void;
  /** One paragraph of a change taken or not: `part` is its index in an
   *  unsplit change (-1: `callId` is already that paragraph). */
  onDecidePart?: (callId: string, part: number, take: boolean) => void;
  /** A rejected paragraph back to undecided (恢复 in the preview). */
  onUndoReject?: (callId: string) => void;
  /** Whether a change has finished arriving: one still being written
   *  waits, the rest can be decided while the Agent keeps working. */
  isSettled?: (callId: string) => boolean;
  tools?: ReactNode;
  mediaPreview?: ReactNode;
  pendingMedia?: boolean;
  onStop?: () => void;
  /** Friendly names for tool calls (chat-labels' toolActivity). */
  toolLabels?: Record<string, string>;
  /** This document's identity, to tell its own past tasks from others'. */
  documentId?: string;
  /** The home's chips (assist.ts); the labels' static ones otherwise. */
  suggestions?: Suggestion[];
  /** Whether those were written by the model for this document. */
  aiSuggestions?: boolean;
  /** The auto-writing panel while it is open (AutoWriter.tsx). */
  autoWriter?: ReactNode;
  /** Pictures on their way, shown where they will go (draft-diff.ts). */
  pendingImages?: PendingImage[];
}) {
  const labels = workspaceLabels(language);
  const [notice, setNotice] = useState(false);
  const { tasksOpen, setTasksOpen, tasksHidden, toggleTasks } = useTasksPanel();
  const root = useRef<HTMLElement>(null);
  const pending = draft?.operations ?? [];
  const streamingTurns = conversation.streaming?.turns;
  // One pass over the turns: tasks, tool steps and each step's result.
  const { tasks, steps } = useMemo(
    () =>
      workspaceOutline([...conversation.history, ...(streamingTurns ?? [])]),
    [conversation.history, streamingTurns],
  );
  const hasDraft = pending.length > 0 || pendingMedia;
  // The panel can be tucked away to read the conversation; a new change
  // brings it back.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (pending.length) setCollapsed(false);
  }, [pending.length]);
  const previewOpen = hasDraft && !collapsed;
  const conversationView = useColumnGlide(previewOpen);
  const status = conversation.busy
    ? "running"
    : pending.length
      ? "ready"
      : "idle";
  const guarded = (action: () => void) => {
    if (pending.length || pendingMedia) {
      setNotice(true);
      return;
    }
    action();
    setNotice(false);
    setTasksOpen(false);
  };
  return (
    <section
      ref={root}
      className={`agent-workspace agent-home ${tasks.length || autoWriter ? "has-conversation" : "is-empty"}${autoWriter ? " is-auto-writing" : ""}${previewOpen ? " has-draft-open" : ""}${tasksOpen ? " tasks-open" : ""}${tasksHidden ? " tasks-hidden" : ""}`}
      aria-label={labels.title}
    >
      <header className="workspace-header">
        <button
          className="workspace-icon-button workspace-tasks-toggle"
          aria-label={labels.tasks}
          aria-expanded={tasksOpen || !tasksHidden}
          title={labels.tasks}
          onClick={toggleTasks}
        >
          <HamburgerIcon />
        </button>
        <span className={`workspace-status is-${status}`} role="status">
          <span className="workspace-status-dot" aria-hidden />
          {labels[status]}
        </span>
        <span className="workspace-header-spacer" />
        {/* A blank document in a new tab of this window; the window stays in
            Agent, so the next task starts on the new document. */}
        <button
          className="workspace-button workspace-new-document"
          onClick={() => window.dispatchEvent(new Event(NEW_DOCUMENT_EVENT))}
        >
          <PlusIcon />
          {labels.newDocument}
        </button>
        {/* The composer's own Stop covers a running reply; this one is for
            images still generating after the reply ended. */}
        {pendingMedia && !conversation.busy && (
          <button
            className="workspace-button is-danger"
            onClick={onStop ?? conversation.stop}
          >
            {labels.stop}
          </button>
        )}
        {/* Write → is in the window bar, mirroring Write's "← Agent". */}
      </header>
      <div className="workspace-columns">
        <div
          className="workspace-tasks-scrim"
          aria-hidden
          onClick={() => setTasksOpen(false)}
        />
        <WorkspaceTasks
          labels={labels}
          conversation={conversation}
          tasks={tasks}
          steps={steps}
          notice={notice}
          documentId={documentId}
          documentPath={documentPath}
          toolLabels={toolLabels}
          guarded={guarded}
          onLeave={() => setTasksOpen(false)}
        />
        <div className="workspace-conversation" ref={conversationView}>
          {autoWriter}
          {!tasks.length && !autoWriter && (
            <div className="agent-home-heading">
              <span className="agent-home-mark" aria-hidden>
                ✳
              </span>
              <h1>{labels.heading}</h1>
              <p>{labels.subheading}</p>
            </div>
          )}
          {children}
          {hasDraft && collapsed && (
            <button
              className="workspace-draft-pill"
              onClick={() => setCollapsed(false)}
            >
              {labels.preview}
              {pending.length > 0 && (
                <span className="workspace-count">{pending.length}</span>
              )}
            </button>
          )}
          {!tasks.length && !autoWriter && (
            <div
              className={`agent-home-suggestions${aiSuggestions ? " is-ai" : ""}`}
              // Re-mounted when the model's set replaces the fallbacks, so
              // the chips arrive again instead of changing in place.
              key={aiSuggestions ? "ai" : "static"}
            >
              {(
                suggestions ??
                labels.suggestions.map((prompt) => ({ label: prompt, prompt }))
              ).map((suggestion, i) => (
                <button
                  key={suggestion.label}
                  style={{ "--i": i } as React.CSSProperties}
                  title={suggestion.prompt}
                  onClick={() => fillComposer(root.current, suggestion.prompt)}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}
          {tools && <div className="workspace-extra-tools">{tools}</div>}
        </div>
        <WorkspacePreview
          labels={labels}
          open={previewOpen}
          onCollapse={() => setCollapsed(true)}
          documentPath={documentPath}
          draft={draft}
          preview={preview}
          conflict={conflict}
          rejected={rejected}
          pendingImages={pendingImages}
          isSettled={isSettled}
          mediaPreview={mediaPreview}
          onAccept={onAccept}
          onReject={onReject}
          onImageAccept={onImageAccept}
          onImageReject={onImageReject}
          onRestore={onRestore}
          onDecidePart={onDecidePart}
          onUndoReject={onUndoReject}
        />
      </div>
    </section>
  );
}
