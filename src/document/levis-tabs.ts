import { firstLevelOneHeading } from "./save-default-name";

/**
 * Levis' per-window tab state, kept beside upstream's doc-tabs.ts: the
 * Agent/Write surface, tabs in use by the Agent, titles suggested for
 * untitled documents, and the events the Agent home and App trade.
 */

/** Settings > Textus AI > Name new documents automatically: an unsaved
 *  document is called by its first heading. Set by App from settings. */
let headingTitles = false;
export function setHeadingTitles(enabled: boolean) {
  headingTitles = enabled;
}

/** Titles the text model suggested for unsaved documents, by tab id: they
 *  name the tab and the Save dialog without editing the text. */
const suggestedTitles = new Map<string, string>();
export const TITLES_CHANGED = "textus-tab-titles";
export function setSuggestedTitle(tabId: string, title: string) {
  suggestedTitles.set(tabId, title);
  window.dispatchEvent(new Event(TITLES_CHANGED));
}
export function hasSuggestedTitle(tabId: string): boolean {
  return suggestedTitles.has(tabId);
}
export function suggestedTitle(tab: {
  id: string;
  path: string | null;
}): string | null {
  return headingTitles && !tab.path
    ? (suggestedTitles.get(tab.id) ?? null)
    : null;
}

/** doc-tabs' tabTitle asks this first for an untitled document: its first
 *  heading, else the suggested title - null leaves it to upstream. */
export function levisTabTitle(tab: {
  id: string;
  content: string;
}): string | null {
  if (!headingTitles) return null;
  // A title sits at the top: the head of the text is enough, and keeps
  // this cheap for a long draft rendered on every keystroke.
  const heading =
    firstLevelOneHeading(tab.content.slice(0, 4000)) ??
    suggestedTitles.get(tab.id);
  if (!heading) return null;
  return heading.length > 40 ? `${heading.slice(0, 40)}…` : heading;
}

/** A past Agent task opened from the history list: App brings up its
 *  document (by file, open tab or saved snapshot) and the editor showing it
 *  restores the conversation. */
export const OPEN_TASK_EVENT = "textus:open-task";
export const RESTORE_TASK_EVENT = "textus:restore-task";
export interface OpenTask {
  entryId: string;
  docPath: string | null;
  documentId: string | null;
  snapshot: string | null;
  title: string;
}
/** Which editor should restore which conversation: `path:<file>` or
 *  `doc:<documentId>` → history entry id. */
export const pendingTaskRestores = new Map<string, string>();

/** Save As moved a document's images: the tab's editor rewrites their srcs
 *  in place and sets `handled` (useSaveTabs, the editor). */
export const REWRITE_IMAGE_SRCS_EVENT = "textus:rewrite-image-srcs";
export interface RewriteImageSrcs {
  tabId: string;
  /** Where the document now lives: the new relative srcs resolve here. */
  docPath: string;
  mappings: { old: string; new: string }[];
  handled: boolean;
}

/** Tabs whose document is in use beyond its text: an Agent conversation,
 *  a pending draft or an image in progress (the editor reports them).
 *  Opening a file never replaces such a tab in place. */
const engagedTabs = new Set<string>();
export function setTabEngaged(tabId: string, engaged: boolean) {
  if (engaged) engagedTabs.add(tabId);
  else engagedTabs.delete(tabId);
}
export function tabIsEngaged(tabId: string): boolean {
  return engagedTabs.has(tabId);
}

/** Agent or Write: one mode for the whole window (the editor sets it).
 *  Null until the first editor decides. */
let windowSurface: boolean | null = null;
export function windowShowsAgent(): boolean {
  return windowSurface === true;
}
export function getWindowSurface(): boolean | null {
  return windowSurface;
}
export function setWindowSurface(agent: boolean) {
  windowSurface = agent;
}
/** The switch-surface shortcut: the active document's editor flips
 *  between Agent and Write (useGlobalShortcuts, the editor). */
export const TOGGLE_SURFACE_EVENT = "textus:toggle-surface";

/** Asks App for a blank tab in this window (the Agent home's New document). */
export const NEW_DOCUMENT_EVENT = "textus:new-document";

/** Each tab's workspace identity (DocTab.workspaceId, else its id), kept
 *  by App's Levis layer as tabs change, so an editor finds its Agent draft
 *  again after a relaunch gave its tab a new id. */
const workspaceIds = new Map<string, string>();
export function syncWorkspaceIds(
  tabs: readonly { id: string; workspaceId?: string }[],
) {
  workspaceIds.clear();
  for (const tab of tabs) workspaceIds.set(tab.id, tab.workspaceId ?? tab.id);
}
export function documentIdOf(tabId: string): string {
  return workspaceIds.get(tabId) ?? tabId;
}
