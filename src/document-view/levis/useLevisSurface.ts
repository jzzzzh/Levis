import { useEffect, useRef, useState } from "react";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorRunner } from "../../editor/useEditorRunner";
import { useDocumentWorkspace } from "../useDocumentWorkspace";
import {
  getWindowSurface,
  setWindowSurface,
  TOGGLE_SURFACE_EVENT,
} from "../../document/levis-tabs";
import { modalDialogOpen } from "../../ui/useModalDialog";
import { useLatest } from "../../utils/hooks/useLatest";

/** The window's surface the first editor finds, else the setting's. */
function initialSurface(agentFirst: boolean) {
  const current = getWindowSurface();
  if (current !== null) return current;
  setWindowSurface(agentFirst);
  return agentFirst;
}

/**
 * Agent or Write for one tab's editor: the workspace behind the Agent
 * surface, which surface the window is on, and switching between them
 * (the window bar's switch and its shortcut).
 */
export function useLevisSurface({
  run,
  documentId,
  isActive,
  enabled,
  agentFirst,
  rootRef,
  closeAgentPanel,
}: {
  run: EditorRunner;
  documentId: string;
  isActive: boolean;
  /** Not on a phone, nor on the tour's practice tab. */
  enabled: boolean;
  agentFirst: boolean;
  rootRef: { readonly current: HTMLElement | null };
  closeAgentPanel: () => void;
}) {
  const [startOpen] = useState(() => enabled && initialSurface(agentFirst));
  const workspace = useDocumentWorkspace(run, documentId, startOpen);
  const [mounted, setMounted] = useState(startOpen);
  const setOpen = workspace.setOpen;

  // The active tab sets the window's surface - recorded only when the user
  // switches on it, not when a tab becomes active, which would write that
  // tab's own old mode over the window's.
  const wasActive = useRef(isActive);
  useEffect(() => {
    const becameActive = isActive && !wasActive.current;
    wasActive.current = isActive;
    if (enabled && isActive && !becameActive) setWindowSurface(workspace.open);
  }, [workspace.open, isActive, enabled]);
  useEffect(() => {
    const surface = getWindowSurface();
    if (!enabled || !isActive || surface === null) return;
    if (surface) setMounted(true);
    setOpen(surface);
    // Only on becoming active: the effect above records changes made here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Leaving Agent for Write hands the caret to the page, and the page rises
  // into place as Agent steps back (workspace.css).
  const wasOpen = useRef(workspace.open);
  useEffect(() => {
    const left = wasOpen.current && !workspace.open;
    wasOpen.current = workspace.open;
    if (!left || !isActive) return;
    if (!modalDialogOpen()) run((ctx) => ctx.get(editorViewCtx).focus());
    const root = rootRef.current;
    if (!root) return;
    root.classList.remove("surface-arrive");
    void root.offsetWidth;
    root.classList.add("surface-arrive");
    const done = (event: AnimationEvent) => {
      if (event.target !== root) return;
      root.classList.remove("surface-arrive");
      root.removeEventListener("animationend", done);
    };
    root.addEventListener("animationend", done);
  }, [workspace.open, isActive, run, rootRef]);

  // The window's chrome follows the active tab's surface (levis-window.css,
  // workspace.css): an attribute, so no rule has to watch the page (:has).
  useEffect(() => {
    if (!isActive) return;
    const root = document.documentElement;
    if (workspace.open && enabled) root.setAttribute("data-levis-agent", "");
    else root.removeAttribute("data-levis-agent");
  }, [isActive, workspace.open, enabled]);

  /** Agent (true) or Write. */
  const switchSurface = (agent: boolean) => {
    if (agent === workspace.open) return;
    if (agent) {
      setMounted(true);
      closeAgentPanel();
    }
    workspace.setOpen(agent);
  };
  const switchRef = useLatest(switchSurface);
  useEffect(() => {
    if (!isActive || !enabled) return;
    const flip = () => switchRef.current(!wasOpen.current);
    window.addEventListener(TOGGLE_SURFACE_EVENT, flip);
    return () => window.removeEventListener(TOGGLE_SURFACE_EVENT, flip);
  }, [isActive, enabled, switchRef]);

  /** Opens Agent on this tab (a past task restored here). */
  const showAgent = () => {
    setWindowSurface(true);
    setMounted(true);
    setOpen(true);
  };

  return { workspace, mounted, switchSurface, showAgent };
}

export type LevisSurface = ReturnType<typeof useLevisSurface>;
