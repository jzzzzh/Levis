import { firstLevelOneHeading } from "../../document/save-default-name";
import {
  REWRITE_IMAGE_SRCS_EVENT,
  suggestedTitle,
  type RewriteImageSrcs,
} from "../../document/levis-tabs";

/** Levis: the title the text model suggested for an untitled document
 *  (Name new documents automatically) - never over its own heading. */
export function levisSuggestedName(tab: {
  id: string;
  path: string | null;
  content: string;
}): string | null {
  return firstLevelOneHeading(tab.content) ? null : suggestedTitle(tab);
}

/** Levis: asks the tab's editor to point its pictures at the paths Save As
 *  moved them to, in place - keeping Undo and the Agent conversation. True
 *  when it did, so the editor needn't remount. */
export function rewriteImagesInPlace(
  tabId: string,
  docPath: string,
  mappings: { old: string; new: string }[],
): boolean {
  if (!mappings.length) return false;
  const detail: RewriteImageSrcs = { tabId, docPath, mappings, handled: false };
  window.dispatchEvent(new CustomEvent(REWRITE_IMAGE_SRCS_EVENT, { detail }));
  return detail.handled;
}
