import { blockIds, type SentBlock } from "../doc-blocks";

/** A Markdown string as the blocks a request carries, for one-shot asks
 *  with no editor behind them (Agent-home suggestions, prompt refining).
 *  Split on blank lines - close enough where nothing is edited by id. */
export function markdownBlocks(markdown: string): SentBlock[] {
  const parts = markdown
    .split(/\n\s*\n/)
    .map((part) => part.trimEnd())
    .filter((part) => part.trim());
  const ids = blockIds(parts);
  return parts.map((part, i) => ({
    id: ids[i],
    markdown: part,
    kind: /^#{1,6}\s/.test(part) ? "heading" : "paragraph",
  }));
}
