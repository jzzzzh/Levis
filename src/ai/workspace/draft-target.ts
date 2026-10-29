import {
  documentMarkdown,
  matchTarget,
  type MarkdownBlock,
  type MarkdownMatch,
} from "../doc-markdown";

/**
 * Where a draft operation lands in the document. Upstream's proposals name
 * their block by id (matchTarget); a split part's neighbour, or a proposal
 * from before block ids, is found by its words, which must occur exactly
 * once - never guessed.
 */
export function findDraftTarget(
  blocks: MarkdownBlock[],
  target: { block?: string; lastBlock?: string; anchor?: string },
): MarkdownMatch | null {
  if (target.block) return matchTarget(blocks, target);
  return target.anchor ? anchorMatch(blocks, target.anchor) : null;
}

/** The blocks around the one occurrence of `snippet`, or null. */
export function anchorMatch(
  blocks: MarkdownBlock[],
  snippet: string,
): MarkdownMatch | null {
  if (!snippet || blocks.length === 0) return null;
  const doc = documentMarkdown(blocks);
  const start = doc.indexOf(snippet);
  if (start === -1 || doc.indexOf(snippet, start + 1) !== -1) return null;
  const end = start + snippet.length;
  const at = (offset: number) => {
    for (let i = blocks.length - 1; i >= 0; i--)
      if (offset >= blocks[i].offset) return i;
    return 0;
  };
  const first = blocks[at(start)];
  const last = blocks[Math.max(at(start), at(end - 1))];
  const spanStart = first.offset;
  const spanEnd = last.offset + last.markdown.length;
  return {
    from: first.from,
    to: last.to,
    prefix: doc.slice(spanStart, start),
    suffix: doc.slice(end, spanEnd),
    markdown: doc.slice(spanStart, spanEnd),
  };
}
