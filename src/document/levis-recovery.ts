import { workspaceDrafts } from "../platform/ipc-levis";

/** A recovered draft, with the Agent draft that belongs to its document. */
export interface LevisDraftSnapshot {
  tabId: string;
  path: string | null;
  content: string;
  /** The Agent workspace's document identity, kept by the new tab. */
  workspaceId?: string;
  /** Only an Agent draft was left: the document is the file as it is. */
  workspaceOnly?: boolean;
}

/**
 * Levis: the Agent drafts left from last time, joined to the recovered
 * text drafts (startup-restore) - one with no text draft of its own comes
 * back as a tab of its document, so its draft can be reviewed.
 */
export async function withWorkspaceRecoveries(
  snapshots: { tabId: string; path?: string | null; content: string }[],
  enabled: boolean,
): Promise<LevisDraftSnapshot[]> {
  const list: LevisDraftSnapshot[] = snapshots.map((d) => ({
    ...d,
    path: d.path ?? null,
  }));
  if (!enabled) return list;
  const workspaces = await workspaceDrafts.takeRecoveries().catch(() => []);
  for (const workspace of workspaces) {
    const existing = list.find(
      (d) =>
        (d.tabId === (workspace.tabId ?? workspace.documentId) &&
          d.path === workspace.documentPath) ||
        (!!workspace.documentPath && d.path === workspace.documentPath),
    );
    if (existing) existing.workspaceId = workspace.documentId;
    else
      list.push({
        tabId: workspace.documentId,
        path: workspace.documentPath,
        content: workspace.draft.baseMarkdown,
        workspaceId: workspace.documentId,
        workspaceOnly: true,
      });
  }
  return list;
}
