import { useLayoutEffect, useRef, useState } from "react";

const TASKS_HIDDEN_KEY = "textus.agentTasksHidden";
/** Where the task list turns into a drawer (workspace.css). */
const NARROW = "(max-width: 1000px)";

/** In a wide window the task list is a column that can be folded away
 *  (remembered); narrow, it is a drawer (tasksOpen). */
export function useTasksPanel() {
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasksHidden, setTasksHidden] = useState(
    () => localStorage.getItem(TASKS_HIDDEN_KEY) === "1",
  );
  const toggleTasks = () => {
    if (window.matchMedia(NARROW).matches) {
      setTasksOpen((open) => !open);
      return;
    }
    setTasksHidden((hidden) => {
      localStorage.setItem(TASKS_HIDDEN_KEY, hidden ? "0" : "1");
      return !hidden;
    });
  };
  return { tasksOpen, setTasksOpen, tasksHidden, toggleTasks };
}

/** The draft panel narrows the conversation column; instead of jumping to
 *  its new place, the column glides there (a transform - nothing is laid
 *  out again per frame). Returns the column's ref. */
export function useColumnGlide(previewOpen: boolean) {
  const conversationView = useRef<HTMLDivElement>(null);
  const columnLeft = useRef<number | null>(null);
  useLayoutEffect(() => {
    const column = conversationView.current;
    if (!column) return;
    const left = column.getBoundingClientRect().left;
    const before = columnLeft.current;
    columnLeft.current = left;
    if (
      before === null ||
      Math.abs(before - left) < 2 ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    column.animate(
      [{ transform: `translateX(${before - left}px)` }, { transform: "none" }],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [previewOpen]);
  return conversationView;
}
