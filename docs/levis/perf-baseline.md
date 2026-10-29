# Performance baseline (2026-10-29)

The Levis performance suite (`e2e/levis-perf`, see its README) run on
`main` (upstream Textus 1.3.0-beta.5) and on `levis/integration`, same
machine (Apple silicon, macOS 26), back to back. Documents: Chinese
Markdown from upstream's seeded generator, a 1600×1000 picture every 40
blocks (plus the generator's own). Browser numbers: Chromium against the
dev server; native: the release build, whole process tree.

## Startup (median of 5 cold starts)

|                                | upstream       | Levis             |
| ------------------------------ | -------------- | ----------------- |
| Editor in the page             | 455 ms         | 468 ms (+3%)      |
| JS heap after GC               | 19.2 MB        | 20.6 MB (+1.4 MB) |
| Event listeners                | 553            | 860               |
| Entry chunk (production, gzip) | 343 KB         | 351 KB (+2%)      |
| Native: launch to idle / RSS   | 1.2 s / 281 MB | 1.2 s / 288 MB    |

Levis' lazy chunks: the Agent surface 20 KB gzip, the Magic Diary's room
7 KB - loaded only when used.

## Huge documents (browser)

| Size (pictures) | First screen | Heap   | Key p95 at the end | Kept after closing |
| --------------- | ------------ | ------ | ------------------ | ------------------ |
| 100k (42)       | 0.66 s       | 33 MB  | 17 ms              | 18 MB              |
| 1M (425)        | 2.5 s        | 59 MB  | 125 ms             | 45 MB              |
| 5M (2,127)      | 26 s         | 189 MB | 54 s               | 195 MB             |
| 10M (4,255)     | 86 s         | 352 MB | 178 s              | 378 MB             |

Upstream and Levis are within 2% of each other on every row: these limits
are upstream's editor. Two of them are serious past a million characters -
typing at the end of a 5M document takes tens of seconds per key, and a closed
document's editor is never freed (about 22 MB per open-and-close of a 1M
document, cycle after cycle; DOM nodes grow the same way).

## Native memory, opening the document

|                     | upstream               | Levis          |
| ------------------- | ---------------------- | -------------- |
| 1M, 425 pictures    | 1.80 GB, idle at 5.6 s | 1.84 GB, 5.9 s |
| 10M, 4,255 pictures | 7.9 GB, idle at 187 s  | 8.7 GB, 187 s  |

## Levis' own findings

- **Opening the Agent on a 1M+ document crashes the renderer** (or does not
  finish in 10 minutes at 10M): the Agent's preview renders the whole
  document, every picture with it. 100k is fine (0.6 s). Fixed: past 200k
  characters the preview is windowed (`windowed-preview.ts`) - the draft's
  changes with context, the rest drawn in chunks as they scroll near - its
  pictures load lazily, and a long document is no longer serialized when the
  Agent opens (14 s at 5M). Now 0.5 s at 1M (heap 72 MB) and 1.6 s at 5M
  (236 MB). The bench now finds the Agent button before its clock starts: the
  role query alone took 7.5 s at 5M.
- The release build didn't link (`___isPlatformVersionAtLeast` from
  `@available` in `dictation.m`); fixed while making this baseline.
- Agent ⇄ Write switching keeps no memory (0 MB per cycle).
