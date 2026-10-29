import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type CDPSession, type Page } from "@playwright/test";

/** Measuring helpers shared by the Levis performance suite. */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Where a run's results go: test-results/levis-perf/<PERF_LABEL>. */
export function resultsDir(): string {
  const dir = join(
    root,
    "test-results",
    "levis-perf",
    process.env.PERF_LABEL || "latest",
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export type Row = Record<string, string | number | boolean | null>;

/** One measured case: printed, and written as JSON beside the others. */
export function report(file: string, rows: Row[]) {
  const dir = resultsDir();
  writeFileSync(join(dir, `${file}.json`), JSON.stringify(rows, null, 2));
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const md = [
    `| ${keys.join(" | ")} |`,
    `| ${keys.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${keys.map((k) => fmt(r[k])).join(" | ")} |`),
  ].join("\n");
  writeFileSync(join(dir, `${file}.md`), `# ${file}\n\n${md}\n`);
  console.log(`\n${file}\n${md}\n`);
}

function fmt(v: Row[string] | undefined): string {
  if (v === null || v === undefined) return "—";
  return typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v);
}

export const median = (xs: number[]) => pct(xs, 0.5);

export function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export const mb = (bytes: number) => bytes / 1048576;

/** The renderer's own counters (Chrome DevTools Performance domain). */
export interface Metrics {
  heapMB: number;
  heapTotalMB: number;
  nodes: number;
  listeners: number;
  layouts: number;
  styleRecalcs: number;
  scriptS: number;
}

export async function cdpFor(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  return cdp;
}

/** Full garbage collection, then the counters: what is really kept. */
export async function metrics(cdp: CDPSession, gc = true): Promise<Metrics> {
  if (gc) {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
  }
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(list.map((e) => [e.name, e.value]));
  return {
    heapMB: mb(m.JSHeapUsedSize ?? 0),
    heapTotalMB: mb(m.JSHeapTotalSize ?? 0),
    nodes: m.Nodes ?? 0,
    listeners: m.JSEventListeners ?? 0,
    layouts: m.LayoutCount ?? 0,
    styleRecalcs: m.RecalcStyleCount ?? 0,
    scriptS: m.ScriptDuration ?? 0,
  };
}

/** Counts long tasks from page load (installed before it). */
export function installLongTasks() {
  const w = window as unknown as { __levisLongTasks: number[][] };
  w.__levisLongTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        w.__levisLongTasks.push([e.startTime, e.duration]);
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // Not Chromium: nothing to count.
  }
}

/** Waits until no long task has run for `quietMs`; resolves with the end
 *  of the last one after `since` (page time), or `since` if none ran. */
export async function waitQuiet(
  page: Page,
  since: number,
  quietMs = 1000,
  capMs = 600_000,
): Promise<number> {
  return page.evaluate(
    async ({ since, quietMs, capMs }) => {
      const tasks = (window as unknown as { __levisLongTasks: number[][] })
        .__levisLongTasks;
      const lastEnd = () => {
        const last = tasks.filter(([s]) => s >= since).at(-1);
        return last ? last[0] + last[1] : since;
      };
      const start = performance.now();
      while (
        performance.now() - lastEnd() < quietMs &&
        performance.now() - start < capMs
      )
        await new Promise((r) => setTimeout(r, 100));
      return lastEnd();
    },
    { since, quietMs, capMs },
  );
}

/** Long tasks after `since`: how many, the longest, and their sum. */
export async function longTasksSince(page: Page, since: number) {
  return page.evaluate((since) => {
    const tasks = (
      window as unknown as { __levisLongTasks: number[][] }
    ).__levisLongTasks.filter(([s]) => s >= since);
    return {
      count: tasks.length,
      longest: Math.max(0, ...tasks.map(([, d]) => d)),
      total: tasks.reduce((sum, [, d]) => sum + d, 0),
    };
  }, since);
}

/**
 * A budget: over it, a warning in the output - and with PERF_STRICT=1 a
 * failed test. Budgets in README.md; values null (DNF) always count over.
 */
export function budget(what: string, value: number | null, max: number) {
  const over = value === null || value > max;
  if (!over) return;
  const text = `over budget: ${what} = ${value ?? "DNF"} (max ${max})`;
  console.warn(text);
  if (process.env.PERF_STRICT === "1")
    expect.soft(value, text).toBeLessThan(max);
}
