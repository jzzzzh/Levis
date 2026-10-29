import { createPortal } from "react-dom";
import { AgentWorkspace } from "../../ai/workspace/AgentWorkspace";
import { AutoWriter } from "../../ai/workspace/AutoWriter";
import { SurfaceSwitch } from "../../ai/workspace/SurfaceSwitch";
import { ChatBody } from "../../ai/chat/ChatBody";
import { formatCombo } from "../../utils/shortcuts";
import { WritePlayback } from "../WritePlayback";
import { FillSlotCard } from "../FillSlotCard";
import {
  useLevisWorkspace,
  type LevisWorkspaceProps,
} from "./useLevisWorkspace";

const NO_DOCUMENT = { markdown: "", blocks: [] };

/**
 * Levis' layer over one tab's editor (MilkdownEditor renders it last): the
 * Agent | Write switch and read-aloud in the window bar, the Agent surface
 * over the pane with its draft and conversation, and fill-in cards.
 */
export function LevisWorkspace(props: LevisWorkspaceProps) {
  const levis = useLevisWorkspace(props);
  const { settings, surface, drafts, chrome, auto, chat } = levis;
  const { workspace } = surface;
  const { conversation } = chat;
  const { isActive, phone, tour } = props;
  const { paneEl } = props.review;
  const zh = settings.language.startsWith("zh");
  const slots = chrome.barSlots;
  return (
    <>
      {!phone &&
        slots?.start &&
        isActive &&
        createPortal(
          <SurfaceSwitch
            agent={workspace.open}
            zh={zh}
            docTitle={props.docTitle}
            shortcut={formatCombo(settings.shortcuts.toggleSurface)}
            onChange={surface.switchSurface}
          />,
          slots.start,
        )}
      {slots?.end &&
        isActive &&
        !workspace.open &&
        tour === null &&
        createPortal(
          <WritePlayback reader={levis.reader} language={settings.language} />,
          slots.end,
        )}
      {surface.mounted &&
        paneEl &&
        createPortal(
          <div
            className="agent-workspace-layer"
            hidden={!isActive}
            data-open={workspace.open}
            inert={!workspace.open}
          >
            <AgentWorkspace
              language={settings.language}
              documentPath={props.filePath}
              draft={workspace.draft}
              preview={
                drafts.hasDraftOperations
                  ? workspace.preview
                  : drafts.documentMarkdown
              }
              conflict={workspace.conflict}
              conversation={conversation}
              onAccept={drafts.acceptDraft}
              onReject={drafts.rejectDraft}
              rejected={workspace.rejected}
              onRestore={drafts.restoreChange}
              onDecidePart={drafts.decidePart}
              onUndoReject={drafts.undoReject}
              isSettled={workspace.isSettled}
              onStop={levis.stopTask}
              toolLabels={levis.labels.toolActivity}
              documentId={levis.documentId}
              suggestions={levis.suggestions.items}
              aiSuggestions={levis.suggestions.ai}
              autoWriter={
                auto.autoRequest ? (
                  <AutoWriter
                    key={auto.autoRequest.id}
                    host={auto.host}
                    request={auto.autoRequest}
                    onClose={auto.closeAutoWriter}
                  />
                ) : null
              }
            >
              {drafts.recovery.error && (
                <p role="alert">
                  {zh
                    ? "草稿恢复或保存失败："
                    : "Draft recovery or save failed: "}
                  {drafts.recovery.error}
                </p>
              )}
              {drafts.recovery.interrupted && (
                <p role="status">
                  {zh
                    ? "上次任务已中断；草稿已恢复，不会自动重发请求。"
                    : "The previous task was interrupted. Its draft was restored without restarting requests."}
                </p>
              )}
              <ChatBody
                document={NO_DOCUMENT}
                selectedText={chat.panelSelection?.text ?? null}
                selectionMarkdown={null}
                docPath={props.filePath}
                workspaceRoot={settings.agentWorkspaceRoot || null}
                conversation={{ ...conversation, stop: levis.stopTask }}
                defaultMode="write"
                defaultWebSearch={settings.enableWebSearch}
                labels={levis.labels}
                proposalStatus={(id) =>
                  workspace.statusOf(id) ?? chat.pendingEdits.status(id)
                }
                pendingCount={workspace.draft?.operations.length ?? 0}
                fillHeight
                refreshContext={chat.bridge.panelSendContext}
                onProposals={chat.proposals.showProposals}
                onAcceptProposal={(id) => drafts.acceptDraft(id)}
                onRejectProposal={(id) => drafts.rejectDraft(id)}
                onAcceptAll={() => drafts.acceptDraft()}
                onRejectAll={() => drafts.rejectDraft()}
                pendingBar={false}
                levis={auto.chatHooks}
              />
            </AgentWorkspace>
          </div>,
          paneEl,
        )}
      {chrome.fillRequest && (
        <FillSlotCard
          request={chrome.fillRequest}
          run={props.setup.run}
          settings={settings}
          onClose={chrome.closeFill}
        />
      )}
    </>
  );
}
