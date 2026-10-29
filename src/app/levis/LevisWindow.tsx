import { useEffect } from "react";
import { GlobalDictation } from "../../voice/GlobalDictation";
import { FootprintLayer } from "../../ai/magic-diary/FootprintLayer";
import { makeBlankTab, type DocTab } from "../../document/doc-tabs";
import {
  NEW_DOCUMENT_EVENT,
  OPEN_TASK_EVENT,
  pendingTaskRestores,
  RESTORE_TASK_EVENT,
  setHeadingTitles,
  setWindowSurface,
  syncWorkspaceIds,
  TITLES_CHANGED,
  type OpenTask,
} from "../../document/levis-tabs";
import type { Settings } from "../../prefs/SettingsContext";
import type { TabState } from "../tabs/useTabState";
import { useLatest } from "../../utils/hooks/useLatest";
// The Magic Diary's aged-paper skin for the whole window, applied by
// html[data-magic-diary]: it covers the chrome as well as the page.
import "../../theme/magic-diary-page.css";
import "./levis-window.css";

/**
 * Levis' part of one window (App renders it first in the shell): which
 * document each editor's Agent draft belongs to, the Agent home's New
 * document and past tasks, suggested titles, dictation anywhere, and the
 * Magic Diary's room.
 */
export function LevisWindow({
  tabState,
  settings,
  openFile,
}: {
  tabState: TabState;
  settings: Settings;
  openFile: (path: string) => Promise<void>;
}) {
  // Read by the editors as they render, so set before MainPane renders.
  syncWorkspaceIds(tabState.tabs);
  setHeadingTitles(settings.autoTitleDocuments);
  const latest = useLatest({ tabState, openFile });

  useEffect(() => {
    // A suggested title arrives after the text it names: draw the tabs again.
    const retitle = () => latest.current.tabState.setTabs((prev) => [...prev]);
    // The Agent home's "New document": a tab here, staying on Agent.
    const newDocument = () => {
      setWindowSurface(true);
      latest.current.tabState.addBlankTab();
    };
    // A past task: its document comes up - the file, its open tab or its
    // saved text - and the editor showing it restores the conversation.
    const openTask = (event: Event) => {
      const task = (event as CustomEvent<OpenTask>).detail;
      const { tabState, openFile } = latest.current;
      const restoreIn = (key: string) => {
        pendingTaskRestores.set(key, task.entryId);
        window.dispatchEvent(new Event(RESTORE_TASK_EVENT));
      };
      if (task.docPath) {
        restoreIn(`path:${task.docPath}`);
        void openFile(task.docPath).catch(() => {});
        return;
      }
      const open = tabState.tabsRef.current.find(
        (tab) => (tab.workspaceId ?? tab.id) === task.documentId,
      );
      if (open) {
        restoreIn(`doc:${task.documentId}`);
        tabState.setActiveTabId(open.id);
        return;
      }
      // Its unsaved text: dirty, so closing it asks and recovery keeps it.
      const tab: DocTab = { ...makeBlankTab(), content: task.snapshot ?? "" };
      restoreIn(`doc:${tab.id}`);
      tabState.setTabs((prev) => [...prev, tab]);
      tabState.setActiveTabId(tab.id);
    };
    window.addEventListener(TITLES_CHANGED, retitle);
    window.addEventListener(NEW_DOCUMENT_EVENT, newDocument);
    window.addEventListener(OPEN_TASK_EVENT, openTask);
    return () => {
      window.removeEventListener(TITLES_CHANGED, retitle);
      window.removeEventListener(NEW_DOCUMENT_EVENT, newDocument);
      window.removeEventListener(OPEN_TASK_EVENT, openTask);
    };
  }, [latest]);

  // Settings › Levis, registered once the window is up: the Settings
  // chunk loads after startup, not with it.
  useEffect(() => {
    void import("../../settings/levis/register");
  }, []);

  // The Magic Diary ages the whole window (magic-diary-page.css).
  useEffect(() => {
    const root = document.documentElement;
    if (settings.enableMagicDiary) root.setAttribute("data-magic-diary", "");
    else root.removeAttribute("data-magic-diary");
  }, [settings.enableMagicDiary]);

  return (
    <>
      <GlobalDictation language={settings.language} />
      {/* Whoever walks around the margins while the Magic Diary is on. */}
      <FootprintLayer />
    </>
  );
}
