import { createPortal } from "react-dom";
import type { AgentConversation } from "../chat/useAgentConversation";
import { findConversation, type ChatSummary } from "../chat/chat-history";
import { ContextMenu } from "../../ui/ContextMenu";
import { Presence } from "../../ui/usePresence";
import { basename } from "../../utils/path";
import { firstLevelOneHeading } from "../../document/save-default-name";
import { CheckIcon, CloseIcon, PlusIcon } from "../../ui/icons";
import { OPEN_TASK_EVENT, type OpenTask } from "../../document/levis-tabs";
import type { workspaceLabels } from "./labels";
import { textFromProposals, type WorkspaceStep } from "./workspace-outline";
import { useTaskHistory } from "./useTaskHistory";

/** The workspace's task column: a new task, this conversation's requests
 *  and tool steps, and the past tasks. */
export function WorkspaceTasks({
  labels,
  conversation,
  tasks,
  steps,
  notice,
  documentId,
  documentPath,
  toolLabels,
  guarded,
  onLeave,
}: {
  labels: ReturnType<typeof workspaceLabels>;
  conversation: AgentConversation;
  tasks: string[];
  steps: WorkspaceStep[];
  /** Whether to say a waiting draft must be decided first. */
  notice: boolean;
  documentId?: string;
  documentPath: string | null;
  toolLabels: Record<string, string>;
  /** Runs an action that would replace the conversation, unless a draft
   *  still waits. */
  guarded: (action: () => void) => void;
  /** Another document's task opens: the drawer closes. */
  onLeave: () => void;
}) {
  const { savedTasks, taskMenu, setTaskMenu, deleted, deleteTask, undoDelete } =
    useTaskHistory(conversation.conversationId);
  const ownTask = (entry: ChatSummary) =>
    entry.documentId
      ? entry.documentId === documentId
      : !!documentPath && entry.docPath === documentPath;
  const openTask = async (summary: ChatSummary) => {
    // The list holds summaries; the turns are read from the task's file.
    const entry = await findConversation(summary.id);
    if (!entry) return;
    if (ownTask(entry)) {
      guarded(() => conversation.restore(entry.id, entry.turns));
      return;
    }
    onLeave();
    window.dispatchEvent(
      new CustomEvent<OpenTask>(OPEN_TASK_EVENT, {
        detail: {
          entryId: entry.id,
          docPath: entry.docPath,
          documentId: entry.documentId ?? null,
          snapshot: entry.snapshot ?? textFromProposals(entry) ?? null,
          title: entry.title,
        },
      }),
    );
  };
  const stepName = (name: string) =>
    name === "propose_edit"
      ? labels.proposal
      : (toolLabels[name] ?? toolLabels["*"] ?? name);
  return (
    <aside className="workspace-tasks">
      <button
        className="workspace-new-task"
        disabled={conversation.busy}
        onClick={() => guarded(conversation.reset)}
      >
        <PlusIcon />
        {labels.newTask}
      </button>
      {notice && (
        <p className="workspace-notice" role="alert">
          {labels.resolve}
        </p>
      )}
      {tasks.length > 0 && (
        <>
          <h3>{labels.conversation}</h3>
          {tasks.map((task, i) => (
            <p className="workspace-task-line" key={i}>
              {task}
            </p>
          ))}
        </>
      )}
      {steps.length > 0 && (
        <ol className="workspace-timeline">
          {steps.map((step) => (
            <li key={step.id} className={step.done ? "is-done" : "is-running"}>
              <details>
                <summary>
                  <span className="workspace-step-mark" aria-hidden>
                    {step.done ? <CheckIcon /> : null}
                  </span>
                  {step.names.map(({ name, count }, i) => (
                    <span key={name}>
                      {i > 0 && " · "}
                      {stepName(name)}
                      {count > 1 && (
                        <span className="workspace-step-count">×{count}</span>
                      )}
                    </span>
                  ))}
                </summary>
                <pre>{step.detail}</pre>
              </details>
            </li>
          ))}
        </ol>
      )}
      <h3>{labels.history}</h3>
      {savedTasks.length === 0 && (
        <div className="workspace-empty-history">{labels.noHistory}</div>
      )}
      {deleted && (
        <div className="workspace-history-undo" role="status">
          <span>{labels.taskDeleted}</span>
          <button type="button" onClick={undoDelete}>
            {labels.undo}
          </button>
        </div>
      )}
      {savedTasks.map((entry) => (
        <div className="workspace-history-row" key={entry.id}>
          <button
            className="workspace-history-task"
            disabled={conversation.busy}
            title={entry.title}
            onClick={() => void openTask(entry)}
            onContextMenu={(event) => {
              // Its own menu - not the editor's, which the Agent
              // surface would otherwise reach through its portal.
              event.preventDefault();
              event.stopPropagation();
              setTaskMenu({ entry, x: event.clientX, y: event.clientY });
            }}
          >
            <span className="workspace-history-title">{entry.title}</span>
            {!ownTask(entry) && (entry.docPath || entry.snapshot) && (
              <span className="workspace-history-doc">
                {entry.docPath
                  ? basename(entry.docPath)
                  : (firstLevelOneHeading(entry.snapshot ?? "") ??
                    labels.untitledDoc)}
              </span>
            )}
          </button>
          <button
            type="button"
            className="workspace-history-delete"
            aria-label={labels.deleteTask}
            title={labels.deleteTask}
            onClick={() => void deleteTask(entry)}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      {/* On the page itself: the task list scrolls, and the surface
          it sits in moves while Agent opens. */}
      {createPortal(
        <Presence show={!!taskMenu} exitMs={150}>
          {taskMenu && (
            <ContextMenu
              x={taskMenu.x}
              y={taskMenu.y}
              title={taskMenu.entry.title}
              onClose={() => setTaskMenu(null)}
              items={[
                {
                  label: labels.openTask,
                  onSelect: () => void openTask(taskMenu.entry),
                },
                "separator",
                {
                  label: labels.deleteTask,
                  danger: true,
                  onSelect: () => void deleteTask(taskMenu.entry),
                },
              ]}
            />
          )}
        </Presence>,
        document.body,
      )}
    </aside>
  );
}
