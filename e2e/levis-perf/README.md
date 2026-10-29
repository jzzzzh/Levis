# Levis performance suite

Measures what a writer feels and what the machine pays: startup, huge
documents with pictures, memory over a long session, the bundle, and the
real app's processes. It reports numbers; budgets (below) only fail a run
with `PERF_STRICT=1`. Kept out of the e2e suite and CI - a full run takes a
while. Results: `test-results/levis-perf/<PERF_LABEL>/*.json|md`.

```bash
npm run bench:levis                                   # everything but native
npm run bench:levis -- startup                        # one file
PERF_SIZES=10m,20m npm run bench:levis -- huge-doc    # bigger documents
LEVIS_APP=src-tauri/target/release/textus npm run bench:levis -- native
node scripts/levis-perf-compare.mjs main levis        # two labelled runs
```

To see what Levis adds, run the same files on `main` (a worktree with this
folder copied in, `PERF_AGENT=0`) with `PERF_LABEL=main`, then on
`levis/integration` with `PERF_LABEL=levis`, and compare.

| File              | Cases                                                                                                                                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startup.perf.ts` | Cold start ×`PERF_RUNS` (5) per variant - Write, the Agent home, the Magic Diary on - each in a fresh context: editor in the page, idle, requests and bytes loaded, long tasks, JS heap after GC, DOM nodes, listeners. Dev server: times include on-demand transforms; compare like with like.                     |
| `huge-doc.perf.ts` | Per size in `PERF_SIZES` (100k, 1m, 5m, 10m characters), a picture every `PERF_IMAGE_EVERY` (40) blocks, each its own `PERF_IMAGE_SIZE` (1600×1000) PNG: first screen, idle, long tasks, heap and DOM, pictures in the DOM and decoded, jump to the end, typing at the end (p50/p95), save, heap kept after closing, then the Agent opened on it. A step over `PERF_STEP_CAP_S` (600) or a renderer crash is a DNF; the next size still runs (own browser). |
| `leaks.perf.ts`   | `PERF_LEAK_CYCLES` (6) × opening and closing a `PERF_LEAK_SIZE` (1m) document, and × 5 Agent⇄Write switches: heap after GC per cycle and its slope (MB per cycle).                                                                                                                                                  |
| `bundle.perf.ts`  | A production build: the startup entry chunk (upstream caps it at 1.1 MB), all JS and CSS, raw and gzip, and Levis' lazy chunks (Agent surface, Magic Diary room).                                                                                                                                                 |
| `native.perf.ts`  | The built app (`LEVIS_APP`), under a throw-away `HOME`: launch to idle (under 3% CPU for 3 s) and the RSS of the whole tree - Rust plus the WebView's processes - peak and settled, empty and opening `PERF_NATIVE_SIZES` (1m, 10m) with their pictures on disk. Quit Textus first. macOS and Linux.                     |

## Budgets

Rates per million characters, so every size is held to the same pace:

| Measure                          | Budget                    |
| -------------------------------- | ------------------------- |
| Startup: editor in the page      | 2.5 s                     |
| Startup: JS heap                 | 60 MB                     |
| Huge document: first screen      | 1 s + 2.5 s per million   |
| Huge document: idle              | 2 s + 6 s per million     |
| Huge document: JS heap           | 120 MB + 250 MB per million |
| Typing at the end: key p95       | 50 ms                     |
| Heap kept after closing          | 20 MB                     |
