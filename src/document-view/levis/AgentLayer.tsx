import { AgentWorkspace } from "../../ai/workspace/AgentWorkspace";
import { AutoWriter } from "../../ai/workspace/AutoWriter";
import { ChatBody } from "../../ai/chat/ChatBody";
import type { LevisWorkspaceState } from "./useLevisWorkspace";

const NO_DOCUMENT = { markdown: "", blocks: [] };

/** The Agent surface over the pane: its draft beside its conversation.
 *  Loaded the first time Agent opens on any tab (LevisWorkspace). */
export function AgentLayer({ levis }: { levis: LevisWorkspaceState }) {
  const { settings, surface, drafts, auto, chat, isActive } = levis;
  const { workspace } = surface;
  const { conversation } = chat;
  const zh = settings.language.startsWith("zh");
  return (
    <div
      className="agent-workspace-layer"
      hidden={!isActive}
      data-open={workspace.open}
      inert={!workspace.open}
    >
      <AgentWorkspace
        language={settings.language}
        documentPath={levis.filePath}
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
            {zh ? "草稿恢复或保存失败：" : "Draft recovery or save failed: "}
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
          docPath={levis.filePath}
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
    </div>
  );
}
