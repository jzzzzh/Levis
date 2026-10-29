import { useEffect, useMemo } from "react";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorSetup } from "../useEditorSetup";
import type { EditorChat } from "../useEditorChat";
import type { EditorReview } from "../useEditorReview";
import { useWritePlayback } from "../WritePlayback";
import { useEditorDictationTarget } from "../useEditorDictationTarget";
import { useAutoTitle } from "../useAutoTitle";
import { useAgentSuggestions } from "../../ai/workspace/assist";
import { chatLabels } from "../../ai/chat/chat-labels";
import { documentIdOf } from "../../document/levis-tabs";
import { useSettings } from "../../prefs/SettingsContext";
import type { TourAi } from "../../utils/events";
import { useLevisSurface } from "./useLevisSurface";
import { useLevisTaskLinks } from "./useLevisTaskLinks";
import { useLevisDrafts } from "./useLevisDrafts";
import { useLevisAutoWriting } from "./useLevisAutoWriting";
import { useLevisChrome } from "./useLevisChrome";
import { setLevisMenuActions } from "./menu-actions";
import { onDocChange } from "./doc-changes";

export interface LevisWorkspaceProps {
  setup: EditorSetup;
  chat: EditorChat;
  review: EditorReview;
  tabId: string;
  filePath: string | null;
  docTitle: string;
  initialValue: string;
  isActive: boolean;
  phone: boolean;
  tour: TourAi | null;
}

/**
 * Everything Levis adds to one tab's editor, composed: the Agent surface
 * and its draft, auto-writing, read-aloud and dictation on the page, the
 * automatic title, and where they draw.
 */
export function useLevisWorkspace(props: LevisWorkspaceProps) {
  const { setup, chat, review, tabId, filePath, isActive, phone, tour } = props;
  const { run } = setup;
  const { conversation } = chat;
  const { t, settings, setSettings } = useSettings();
  const inTour = tour !== null;
  const documentId = useMemo(() => documentIdOf(tabId), [tabId]);

  const surface = useLevisSurface({
    run,
    documentId,
    isActive,
    enabled: !phone && !inTour,
    agentFirst: settings.defaultHome !== "write",
    rootRef: review.rootRef,
    closeAgentPanel: () => chat.agentPanel.setOpen(false),
  });
  const { workspace } = surface;

  const drafts = useLevisDrafts({
    run,
    tabId,
    documentId,
    filePath,
    surface,
    conversation,
    router: chat.levisRouter,
    isActive,
    recoveryEnabled: settings.enableDraftRecovery && !inTour,
    language: settings.language,
  });

  useLevisTaskLinks({
    run,
    tabId,
    documentId,
    filePath,
    filePathRef: setup.filePathRef,
    conversation,
    engaged:
      conversation.history.length > 0 ||
      conversation.busy ||
      !!workspace.draft?.operations.length,
    enabled: !inTour,
    showAgent: surface.showAgent,
  });

  // The page: read aloud, and dictation into it, while Write is on screen.
  const writing = isActive && !workspace.open && !inTour;
  const reader = useWritePlayback(run, writing);
  useEditorDictationTarget(run, isActive && !workspace.open);
  useEffect(() => {
    setLevisMenuActions(run, {
      language: settings.language,
      readSelection: writing ? () => void reader.start("selection") : undefined,
    });
    return () => setLevisMenuActions(run, null);
  }, [run, writing, reader, settings.language]);

  // An untitled document's title, from what is written in it.
  const noteTitle = useAutoTitle(tabId, filePath, settings, props.initialValue);
  useEffect(() => onDocChange(tabId, noteTitle), [tabId, noteTitle]);

  // The Magic Diary waits on a redraw to release a pending turn when it is
  // switched off.
  useEffect(() => {
    run((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setMeta("addToHistory", false));
    });
  }, [settings.enableMagicDiary, run]);

  const stopTask = () => conversation.stop();
  const auto = useLevisAutoWriting({
    filePath,
    settings,
    setSettings,
    surface,
    drafts,
    conversation,
    isActive,
    sendContext: chat.bridge.panelSendContext,
    showProposals: chat.proposals.showProposals,
    stopTask,
    voiceLanguage: settings.language,
  });

  const homeEmpty =
    !conversation.history.length &&
    !conversation.busy &&
    !conversation.streaming;
  const suggestions = useAgentSuggestions(
    settings,
    drafts.documentMarkdown,
    drafts.visible && homeEmpty && !inTour,
  );
  const chrome = useLevisChrome({
    paneEl: review.paneEl,
    contentEl: review.contentEl,
  });
  const labels = useMemo(
    () => chatLabels(t, settings.language),
    [t, settings.language],
  );

  return {
    ...props,
    settings,
    documentId,
    surface,
    drafts,
    reader,
    auto,
    suggestions,
    chrome,
    stopTask,
    labels,
  };
}
