import { test } from "@playwright/test";
import { openApp } from "../helpers";
import { hugeDoc, makePng, parseSize } from "./fixtures";
import { cdpFor, metrics, report, type Row } from "./probes";

/**
 * Memory over time: what a long session keeps after work it has finished.
 * Each cycle is followed by a full GC; a heap that climbs cycle after
 * cycle is a leak. Cycles: opening and closing a large document, and
 * switching between Agent and Write.
 *
 * Env: PERF_LEAK_SIZE (default "1m"), PERF_LEAK_CYCLES (default 6).
 */

const SIZE = process.env.PERF_LEAK_SIZE ?? "1m";
const CYCLES = Number(process.env.PERF_LEAK_CYCLES) || 6;

/** Least-squares slope of the heap over the cycles: MB per cycle. */
function slope(ys: number[]): number {
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}

test("memory over repeated work", async ({ page }) => {
  test.setTimeout(60 * 60_000);
  const doc = hugeDoc(SIZE, parseSize(SIZE), 40);
  const png = makePng(800, 500);
  await page.route("http://asset.localhost/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await openApp(page, {
    home: true,
    settings: { language: "zh", newDocumentMode: "tab" },
  });
  const cdp = await cdpFor(page);
  const rows: Row[] = [];
  const baseline = await metrics(cdp);
  rows.push({ cycle: "start", heapMB: baseline.heapMB, nodes: baseline.nodes });

  // Open and close the same large document.
  const openClose: number[] = [];
  for (let i = 1; i <= CYCLES; i++) {
    const path = `/perf/leak-${i}.md`;
    await page.evaluate(
      ({ path, markdown }) => {
        const w = window as unknown as {
          __devFiles?: Record<string, string>;
          __devEmitTauriEvent: (n: string, p?: unknown) => void;
        };
        w.__devFiles = { [path]: markdown };
        w.__devEmitTauriEvent("tauri://drag-drop", {
          paths: [path],
          position: { x: 0, y: 0 },
        });
      },
      { path, markdown: doc.markdown },
    );
    await page.waitForFunction(
      (first) =>
        !!document
          .querySelector('[data-active-tab="true"] .ProseMirror > :is(h1, h2)')
          ?.textContent?.includes(first),
      doc.firstHeading,
      { timeout: 10 * 60_000, polling: 200 },
    );
    await page.waitForTimeout(1500);
    await page.evaluate(() =>
      (
        window as unknown as { __devEmitTauriEvent: (n: string) => void }
      ).__devEmitTauriEvent("menu-close-tab"),
    );
    await page.waitForTimeout(1500);
    const m = await metrics(cdp);
    openClose.push(m.heapMB);
    rows.push({ cycle: `open+close ${i}`, heapMB: m.heapMB, nodes: m.nodes });
  }

  // Agent ⇄ Write on a small document.
  const switches: number[] = [];
  const toAgent = page.getByRole("button", { name: "Agent", exact: true });
  const toWrite = page.getByRole("button", { name: /^(Write|写作) ·/ });
  // Upstream has no Agent surface: the switch cycles need one.
  const hasAgent = (await toAgent.count()) + (await toWrite.count()) > 0;
  for (let i = 1; hasAgent && i <= CYCLES; i++) {
    for (let k = 0; k < 5; k++) {
      if (await toWrite.isVisible()) await toWrite.click();
      await page.waitForTimeout(150);
      await toAgent.click();
      await page.waitForTimeout(150);
    }
    const m = await metrics(cdp);
    switches.push(m.heapMB);
    rows.push({
      cycle: `5× Agent⇄Write ${i}`,
      heapMB: m.heapMB,
      nodes: m.nodes,
    });
  }

  rows.push({
    cycle: "slope MB/cycle (open+close)",
    heapMB: slope(openClose),
    nodes: null,
  });
  rows.push({
    cycle: "slope MB/cycle (Agent⇄Write)",
    heapMB: switches.length ? slope(switches) : null,
    nodes: null,
  });
  report(`leaks-${SIZE}`, rows);
});
