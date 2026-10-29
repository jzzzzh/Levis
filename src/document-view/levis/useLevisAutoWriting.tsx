import { useState } from "react";
import { ai } from "../../platform/ipc";
import type {
  AgentConversation,
  AgentRequestOptions,
} from "../../ai/chat/useAgentConversation";
import type { ComposerMenuItem } from "../../ai/chat/ComposerMenu";
import { proposalsFromTurns } from "../../ai/chat/chat-body-types";
import type { LevisChatHooks } from "../../ai/chat/levis-chat";
import type { AutoWriterHost } from "../../ai/workspace/AutoWriter";
import { AgentTools } from "../../ai/workspace/AgentTools";
import { ProjectChip } from "../../ai/workspace/ProjectChip";
import {
  useProjectMaterial,
  type AutoWriteRequest,
} from "../../ai/workspace/useProjectMaterial";
import type { EditProposal } from "../../ai/types";
import type { DocumentSnapshot } from "../../ai/doc-markdown";
import type { Settings } from "../../prefs/SettingsContext";
import { FolderIcon, OutlineTabIcon } from "../../ui/icons";
import { basename } from "../../utils/path";
import type { LevisSurface } from "./useLevisSurface";
import type { LevisDrafts } from "./useLevisDrafts";

/**
 * The Agent composer's own part: the project folder and writing in
 * sections (auto-writing), and what happens to a send from the Agent - it
 * opens a draft, or starts auto-writing instead.
 */
export function useLevisAutoWriting({
  filePath,
  settings,
  setSettings,
  surface,
  drafts,
  conversation,
  isActive,
  sendContext,
  showProposals,
  stopTask,
  voiceLanguage,
}: {
  filePath: string | null;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  surface: LevisSurface;
  drafts: LevisDrafts;
  conversation: AgentConversation;
  isActive: boolean;
  /** The document as the Agent's request reads it now. */
  sendContext: () => Promise<{
    document: DocumentSnapshot;
    focusHeading?: string | null;
  } | null>;
  showProposals: (
    proposals: { callId: string; proposal: EditProposal }[],
  ) => void;
  stopTask: () => void;
  voiceLanguage: string;
}) {
  const { workspace } = surface;
  const zh = settings.language.startsWith("zh");
  const [autoRequest, setAutoRequest] = useState<AutoWriteRequest | null>(null);
  const [sectioned, setSectioned] = useState(false);
  const [folderAdded, setFolderAdded] = useState(false);
  const project = useProjectMaterial(
    filePath,
    settings.agentWorkspaceRoot || null,
    workspace.open && isActive,
  );
  const pickFolder = (then?: () => void) =>
    void ai
      .pickWorkspaceRoot()
      .then((picked) => {
        if (!picked) return;
        setSettings({ agentWorkspaceRoot: picked });
        then?.();
      })
      .catch(() => {});

  const host: AutoWriterHost = {
    docPath: filePath,
    busy: conversation.busy,
    send: async (message) => {
      if (
        !drafts.recovery.loaded ||
        !workspace.begin("write", conversation.conversationId)
      )
        return false;
      const context = await sendContext();
      const turns = await conversation.send(
        context?.document ?? { markdown: "", blocks: [] },
        message,
        [],
        {
          mode: "write",
          webSearch: false,
          focusHeading: context?.focusHeading ?? null,
        },
      );
      if (!turns) return false;
      const proposals = proposalsFromTurns(turns);
      if (proposals.length) showProposals(proposals);
      return true;
    },
    pending: () => workspace.currentDraft()?.operations.length ?? 0,
    pendingCount: workspace.draft?.operations.length ?? 0,
    acceptedCount: () => drafts.acceptedCount.current,
    acceptAll: () => drafts.acceptDraft(),
    rejectAll: () => drafts.rejectDraft(),
    stop: stopTask,
  };

  const menu: ComposerMenuItem[] = [
    {
      key: "project",
      section: "add",
      icon: <FolderIcon />,
      label: folderAdded
        ? zh
          ? "更换项目文件夹"
          : "Change project folder"
        : zh
          ? "添加项目文件夹"
          : "Add project folder",
      hint: folderAdded
        ? project.folder
          ? basename(project.folder)
          : ""
        : zh
          ? "可选：参考里面的大纲、资料和图片写作"
          : "Optional: write from its outline, material and pictures",
      select: () => {
        if (!folderAdded && project.folder) setFolderAdded(true);
        else pickFolder(() => setFolderAdded(true));
      },
    },
    {
      key: "sections",
      section: "tools",
      icon: <OutlineTabIcon />,
      label: zh ? "分节写作" : "Write in sections",
      chip: zh ? "分节写作" : "Sections",
      hint: zh
        ? "先列出章节，再逐节写成草稿，适合长文"
        : "Plans the sections, then drafts them one by one - for long pieces",
      on: sectioned,
      disabled: conversation.busy || !!autoRequest,
      select: () => setSectioned((on) => !on),
    },
  ];

  /** A send from the Agent: auto-writing when sections or material are
   *  asked for, else a request whose proposals go to the draft. */
  const prepareSend = (
    message: string,
    options: AgentRequestOptions,
  ): AgentRequestOptions | "taken" | null => {
    const picked =
      folderAdded &&
      !!project.folder &&
      project.material.length + project.pictures.length > 0;
    if (options.mode === "write" && (sectioned || picked) && !autoRequest) {
      setAutoRequest({
        id: crypto.randomUUID(),
        folder: picked ? project.folder : null,
        material: picked ? project.material : [],
        pictures: picked ? project.pictures : [],
        extra: message,
        images: false,
      });
      setSectioned(false);
      return "taken";
    }
    if (
      !drafts.recovery.loaded ||
      !workspace.begin(options.mode, conversation.conversationId)
    )
      return null;
    return options;
  };

  const chatHooks: LevisChatHooks = {
    prepareSend,
    composer: {
      active: workspace.open && isActive,
      voiceLanguage,
      toolbar: (
        <>
          <AgentTools items={menu} zh={zh} />
          {folderAdded && (
            <ProjectChip
              project={project}
              zh={zh}
              disabled={conversation.busy || !!autoRequest}
              onChangeFolder={() => pickFolder()}
              onRemove={() => {
                project.clear();
                setFolderAdded(false);
              }}
            />
          )}
        </>
      ),
    },
  };

  return {
    host,
    chatHooks,
    autoRequest,
    closeAutoWriter: () => setAutoRequest(null),
  };
}
