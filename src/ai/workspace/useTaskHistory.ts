import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteConversation,
  findConversation,
  saveConversation,
  useChatHistory,
  type ChatHistoryEntry,
  type ChatSummary,
} from "../chat/chat-history";

/** The workspace's past tasks: the list, a task's own menu, and deleting one
 *  - undoable for a few seconds, the history has no other way back. */
export function useTaskHistory(conversationId: string | null | undefined) {
  const history = useChatHistory();
  // Every past task, newest first: one from another document opens that
  // document too (OPEN_TASK_EVENT), so the conversation and its text return
  // together.
  const savedTasks = useMemo(
    () => history.filter((entry) => entry.id !== conversationId),
    [history, conversationId],
  );
  // A past task's own menu (right-click) and its × on hover.
  const [taskMenu, setTaskMenu] = useState<{
    entry: ChatSummary;
    x: number;
    y: number;
  } | null>(null);
  const [deleted, setDeleted] = useState<ChatHistoryEntry | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );
  const deleteTask = async (summary: ChatSummary) => {
    // Read whole first: Undo saves it back, turns and all.
    const entry = await findConversation(summary.id);
    deleteConversation(summary.id);
    if (!entry) return;
    setDeleted(entry);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeleted(null), 6000);
  };
  const undoDelete = () => {
    if (deleted) saveConversation(deleted);
    setDeleted(null);
  };
  return {
    savedTasks,
    taskMenu,
    setTaskMenu,
    deleted,
    deleteTask,
    undoDelete,
  };
}
