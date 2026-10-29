import { test } from "@playwright/test";
import {
  cdpFor,
  installLongTasks,
  longTasksSince,
  median,
  metrics,
  pct,
  report,
  waitQuiet,
  budget,
  type Row,
} from "./probes";

/**
 * Cold start, several times per variant, each in a fresh browser context
 * (no cache, no storage): until the editor is in the page, until the page
 * is quiet, what was loaded, and the memory kept once it is. Variants: the
 * default (Write), the Agent home (its lazy chunk loads at once), and the
 * Magic Diary on. Run on `main` with the same PERF_LABEL scheme to see what
 * Levis adds (scripts/levis-perf-compare.mjs).
 */

const RUNS = Number(process.env.PERF_RUNS) || 5;

const VARIANTS: { name: string; settings: Record<string, unknown> }[] = [
  { name: "write", settings: {} },
  { name: "agent-home", settings: { defaultHome: "agent" } },
  { name: "magic-diary", settings: { enableMagicDiary: true } },
];

function installEditorClock() {
  // The default buffer keeps 250 entries: a dev server loads more.
  performance.setResourceTimingBufferSize(10_000);
  const w = window as unknown as { __levisEditorAt?: number };
  new MutationObserver((_, observer) => {
    if (document.querySelector('[data-active-tab="true"] .ProseMirror')) {
      w.__levisEditorAt = performance.now();
      observer.disconnect();
    }
  }).observe(document, { childList: true, subtree: true });
}

test("cold start", async ({ browser }) => {
  const rows: Row[] = [];
  for (const variant of VARIANTS) {
    const runs: Row[] = [];
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(installLongTasks);
      await page.addInitScript(installEditorClock);
      await page.addInitScript((settings) => {
        localStorage.setItem(
          "catvinci-settings",
          JSON.stringify({
            language: "zh",
            languageChosen: true,
            onboardingShown: true,
            ...settings,
          }),
        );
      }, variant.settings);
      await page.goto("/");
      await page.waitForFunction(
        () =>
          (window as unknown as { __levisEditorAt?: number })
            .__levisEditorAt !== undefined,
        undefined,
        { timeout: 60_000 },
      );
      const quietAt = await waitQuiet(page, 0, 1000, 60_000);
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType(
          "navigation",
        )[0] as PerformanceNavigationTiming;
        const res = performance.getEntriesByType(
          "resource",
        ) as PerformanceResourceTiming[];
        const of = (kind: string) =>
          res.filter((r) => r.initiatorType === kind || r.name.endsWith(kind));
        return {
          domContentLoaded: nav.domContentLoadedEventEnd,
          load: nav.loadEventEnd,
          editor: (window as unknown as { __levisEditorAt: number })
            .__levisEditorAt,
          requests: res.length,
          scripts: of("script").length,
          kb: res.reduce((s, r) => s + (r.decodedBodySize || 0), 0) / 1024,
        };
      });
      const tasks = await longTasksSince(page, 0);
      const cdp = await cdpFor(page);
      const m = await metrics(cdp);
      runs.push({
        editorMs: timing.editor,
        readyMs: Math.max(quietAt, timing.editor),
        domContentLoadedMs: timing.domContentLoaded,
        requests: timing.requests,
        loadedKB: timing.kb,
        longTasks: tasks.count,
        longestTaskMs: tasks.longest,
        heapMB: m.heapMB,
        nodes: m.nodes,
        listeners: m.listeners,
      });
      await context.close();
    }
    const col = (k: string) => runs.map((r) => r[k] as number);
    rows.push({
      variant: variant.name,
      runs: RUNS,
      editorMs: median(col("editorMs")),
      editorP95Ms: pct(col("editorMs"), 0.95),
      readyMs: median(col("readyMs")),
      domContentLoadedMs: median(col("domContentLoadedMs")),
      requests: median(col("requests")),
      loadedKB: median(col("loadedKB")),
      longTasks: median(col("longTasks")),
      longestTaskMs: median(col("longestTaskMs")),
      heapMB: median(col("heapMB")),
      nodes: median(col("nodes")),
      listeners: median(col("listeners")),
    });
  }
  for (const row of rows) {
    budget(`${row.variant} editor in page (ms)`, row.editorMs as number, 2500);
    budget(`${row.variant} heap (MB)`, row.heapMB as number, 60);
  }
  report("startup", rows);
});
