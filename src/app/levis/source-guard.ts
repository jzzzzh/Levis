import type { DocTab } from "../../document/doc-tabs";
import { windowShowsAgent } from "../../document/levis-tabs";
import { confirmWorkspaceClose } from "../../document/workspace-close";

/**
 * Levis: source mode and split view are ways of writing - from the Agent
 * surface they don't apply, and entering them unmounts the editor with any
 * Agent work, which is resolved first. Leaving them is never held up.
 */
export function levisSourceGuard(
  liveTabs: () => DocTab[],
  activeTabId: string,
  toggle: () => void,
): () => void {
  return () => {
    const tab = liveTabs().find((tb) => tb.id === activeTabId);
    if (!tab || tab.sourceMode) return toggle();
    if (windowShowsAgent()) return;
    void confirmWorkspaceClose([tab.id]).then((ok) => {
      if (ok) toggle();
    });
  };
}
