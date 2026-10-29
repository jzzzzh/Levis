/**
 * The Agent's document panel for a very long document: rendering all of a
 * million characters - every picture with it - took the renderer down. Past
 * LARGE_PREVIEW characters the panel draws only what a reader looks at: the
 * draft's changes, a few blocks of context around each, marked as
 * draft-diff.ts marks them; the rest is cut into chunks drawn as they scroll
 * into view (useLazyChunks).
 *
 * Blocks here are Markdown's top-level blocks, split on blank lines outside
 * fenced code and math; text indented under a list item stays with it. A
 * reference link or footnote defined in another chunk is not resolved - a
 * small price on a document this long.
 */
import { renderDocumentHtml } from "../../editor/markdown/render-html";
import { markDraftChanges } from "./draft-diff";

/** Past this many characters the panel windows its document. */
export const LARGE_PREVIEW = 200_000;
/** About how many characters one lazily drawn chunk holds. */
const CHUNK_CHARS = 24_000;
/** Unchanged blocks shown around each change. */
const CONTEXT = 2;
/** Past this many changed blocks the diff stops looking for matches in
 *  between: the changed stretch is shown whole. */
const MAX_EDITS = 2_000;

const FENCE = /^ {0,3}(`{3,}|~{3,}|\$\$)/;

/** Markdown's top-level blocks, as written. */
export function splitBlocks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  const close = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      current.push(line);
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    const open = FENCE.exec(line);
    if (open) {
      current.push(line);
      // `$$x$$` on one line opens and closes.
      const rest = line.trimStart().slice(open[1].length);
      if (!(open[1] === "$$" && rest.includes("$$")))
        fence = open[1].slice(0, open[1][0] === "$" ? 2 : 3);
      continue;
    }
    if (line.trim()) {
      current.push(line);
      continue;
    }
    // A blank line ends the block, unless what follows is indented under it.
    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (current.length && next < lines.length && /^\s/.test(lines[next]))
      current.push(line);
    else close();
  }
  close();
  return blocks;
}

let lastSplit: { markdown: string; blocks: string[] } | null = null;
let prevSplit: { markdown: string; blocks: string[] } | null = null;
/** splitBlocks, remembering the last two documents: the base and its draft
 *  are split again on every streamed update. */
function blocksOf(markdown: string): string[] {
  for (const hit of [lastSplit, prevSplit])
    if (hit?.markdown === markdown) return hit.blocks;
  prevSplit = lastSplit;
  lastSplit = { markdown, blocks: splitBlocks(markdown) };
  return lastSplit.blocks;
}

type Step =
  | { kind: "same"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string };

/** Myers' diff of two block lists; past MAX_EDITS, the middle whole. */
export function diffBlocks(a: string[], b: string[]): Step[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const steps: Step[] = a
    .slice(0, start)
    .map((text) => ({ kind: "same", text }));
  steps.push(...middle(a.slice(start, endA), b.slice(start, endB)));
  for (let i = endA; i < a.length; i++)
    steps.push({ kind: "same", text: a[i] });
  return steps;
}

function middle(a: string[], b: string[]): Step[] {
  const n = a.length;
  const m = b.length;
  const whole = (): Step[] => [
    ...a.map((text): Step => ({ kind: "removed", text })),
    ...b.map((text): Step => ({ kind: "added", text })),
  ];
  if (!n || !m) return whole();
  const max = Math.min(n + m, MAX_EDITS);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(off - d, off + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])
          ? v[off + k + 1]
          : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return whole();
  const out: Step[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const snap = trace[d];
    const at = (k: number) => snap[k + d];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ kind: "same", text: b[--y] });
      x--;
    }
    if (down) out.push({ kind: "added", text: b[--y] });
    else out.push({ kind: "removed", text: a[--x] });
  }
  while (x > 0 && y > 0) {
    out.push({ kind: "same", text: b[--y] });
    x--;
  }
  return out.reverse();
}

/** Room a chunk not yet drawn keeps, so the scrollbar is about right. */
function estimateHeight(markdown: string): number {
  const pictures = markdown.match(/!\[/g)?.length ?? 0;
  return Math.round((markdown.length / 40) * 27 + pictures * 260);
}

export interface WindowedPreview {
  /** The marked changes, and a placeholder for each chunk. */
  html: string;
  changes: number;
  /** Each placeholder's Markdown, by its data-chunk. */
  chunks: string[];
}

/** `next` - the document, or the draft against `base` - windowed. */
export function windowedPreview(
  base: string | null,
  next: string,
): WindowedPreview {
  const nextBlocks = blocksOf(next);
  const steps: Step[] =
    base === null
      ? nextBlocks.map((text) => ({ kind: "same", text }))
      : diffBlocks(blocksOf(base), nextBlocks);
  // Which unchanged blocks are shown as context.
  const shown = steps.map((s) => s.kind !== "same");
  steps.forEach((s, i) => {
    if (s.kind === "same") return;
    for (let j = Math.max(0, i - CONTEXT); j <= i + CONTEXT; j++)
      if (j < steps.length) shown[j] = true;
  });
  const parts: string[] = [];
  const chunks: string[] = [];
  let changes = 0;
  let pending: string[] = [];
  let pendingChars = 0;
  const flushChunk = () => {
    if (!pending.length) return;
    const markdown = pending.join("\n\n");
    parts.push(
      `<div class="workspace-lazy" data-chunk="${chunks.length}" style="height:${estimateHeight(markdown)}px"></div>`,
    );
    chunks.push(markdown);
    pending = [];
    pendingChars = 0;
  };
  for (let i = 0; i < steps.length;) {
    if (!shown[i]) {
      pending.push(steps[i].text);
      pendingChars += steps[i].text.length;
      if (pendingChars >= CHUNK_CHARS) flushChunk();
      i++;
      continue;
    }
    flushChunk();
    const baseRun: string[] = [];
    const nextRun: string[] = [];
    for (; i < steps.length && shown[i]; i++) {
      const { kind, text } = steps[i];
      if (kind !== "added") baseRun.push(text);
      if (kind !== "removed") nextRun.push(text);
    }
    const marked = markDraftChanges(
      renderDocumentHtml(baseRun.join("\n\n")),
      renderDocumentHtml(nextRun.join("\n\n")),
    );
    changes += marked.changes;
    parts.push(marked.html);
  }
  flushChunk();
  return { html: parts.join(""), changes, chunks };
}

/** Pictures in the panel load as they near the view, decoded off the main
 *  thread. */
export function lazyImages(html: string): string {
  return html.replace(/<img\b/g, '<img loading="lazy" decoding="async"');
}
