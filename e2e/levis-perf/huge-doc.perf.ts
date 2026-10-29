import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { openApp } from "../helpers";
import {
  hugeDoc,
  imageSize,
  makePng,
  parseSize,
  type HugeDoc,
} from "./fixtures";
import {
  cdpFor,
  installLongTasks,
  longTasksSince,
  metrics,
  pct,
  report,
  resultsDir,
  waitQuiet,
  budget,
} from "./probes";

/**
 * Huge documents with pictures, up to tens of millions of characters: how
 * long until the first screen shows and the editor is idle, the memory
 * and DOM it keeps, jumping to the end, typing there, saving, opening the
 * Agent on it, and what closing it gives back. A step that doesn't finish
 * in its time is reported as DNF and the next size still runs.
 *
 * Env: PERF_SIZES (default "100k,1m,5m,10m"), PERF_IMAGE_EVERY (blocks
 * between pictures, default 40; 0 for none), PERF_IMAGE_SIZE ("1600x1000"),
 * PERF_STEP_CAP_S (seconds a step may take, default 600), PERF_AGENT=0 to
 * skip the Agent step, PERF_KEEP_FIXTURES=1 to write the .md files out.
 */

const SIZES = (process.env.PERF_SIZES ?? "100k,1m,5m,10m")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const IMAGE_EVERY = Number(process.env.PERF_IMAGE_EVERY ?? 40);
const STEP_CAP = (Number(process.env.PERF_STEP_CAP_S) || 600) * 1000;
const AGENT = process.env.PERF_AGENT !== "0";
const editor = '[data-active-tab="true"] .ProseMirror';

/** Per key: the input event's time stamp to the frame after it. */
function installKeyLatency() {
  const w = window as unknown as { __levisKeys: number[] };
  w.__levisKeys = [];
  window.addEventListener(
    "beforeinput",
    (event) => {
      const stamp = event.timeStamp;
      requestAnimationFrame(() => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () =>
          w.__levisKeys.push(performance.now() - stamp);
        channel.port2.postMessage(null);
      });
    },
    true,
  );
}

/** Runs a step against its cap: its result, or "DNF" (and why). */
async function runStep<T>(
  name: string,
  dnf: string[],
  fn: () => Promise<T>,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`over ${STEP_CAP / 1000}s`)),
          STEP_CAP,
        );
      }),
    ]);
  } catch (err) {
    dnf.push(`${name}: ${String(err).split("\n")[0].slice(0, 80)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function openDocument(page: Page, doc: HugeDoc, path: string) {
  // Handing the text to the page is not the app's work: done first.
  await page.evaluate(
    ({ path, markdown }) => {
      const w = window as unknown as { __devFiles?: Record<string, string> };
      w.__devFiles = { ...(w.__devFiles ?? {}), [path]: markdown };
    },
    { path, markdown: doc.markdown },
  );
  return page.evaluate(
    async ({ path, first }) => {
      const w = window as unknown as {
        __devEmitTauriEvent: (name: string, payload: unknown) => void;
      };
      const start = performance.now();
      w.__devEmitTauriEvent("tauri://drag-drop", {
        paths: [path],
        position: { x: 0, y: 0 },
      });
      // The first screen: the document's first heading drawn.
      await new Promise<void>((resolve) => {
        const look = () => {
          const pm = document.querySelector(
            '[data-active-tab="true"] .ProseMirror',
          );
          const head = pm?.querySelector(":scope > h1, :scope > h2");
          if (head?.textContent?.includes(first)) resolve();
          else requestAnimationFrame(look);
        };
        look();
      });
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
      return { start, visible: performance.now() - start };
    },
    { path, first: doc.firstHeading },
  );
}

async function imagesInPage(page: Page) {
  return page.evaluate((sel) => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>(`${sel} img`)];
    return {
      inDom: imgs.length,
      decoded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    };
  }, editor);
}

async function jumpToEnd(page: Page) {
  return page.evaluate(async () => {
    const scroller = document.querySelector<HTMLElement>(
      '[data-active-tab="true"] > .editor-scroll',
    )!;
    const heads = scroller.querySelectorAll<HTMLElement>(
      ".ProseMirror > :is(h1, h2, h3)",
    );
    const last = heads[heads.length - 1];
    const start = performance.now();
    last.scrollIntoView({ block: "start" });
    let top = last.getBoundingClientRect().top;
    let stable = 0;
    let settled = performance.now();
    while (stable < 5 && performance.now() - start < 10_000) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = last.getBoundingClientRect().top;
      if (Math.abs(now - top) < 1) stable++;
      else {
        stable = 0;
        settled = performance.now();
      }
      top = now;
    }
    return settled - start;
  });
}

async function typeAtEnd(page: Page, count: number) {
  await page.locator(editor).focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    (window as unknown as { __levisKeys: number[] }).__levisKeys.length = 0;
  });
  const text = "千万字的文档里打字也应当顺畅";
  for (let i = 0; i < count; i++) {
    await page.keyboard.type(text[i % text.length]);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  return page.evaluate(() => [
    ...(window as unknown as { __levisKeys: number[] }).__levisKeys,
  ]);
}

/** File > Save to the write reaching "disk" (the dev shim's write). */
async function save(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: Record<string, unknown>) => unknown;
      };
      __devEmitTauriEvent: (name: string) => void;
    };
    const original = w.__TAURI_INTERNALS__.invoke;
    const start = performance.now();
    const written = new Promise<number>((resolve) => {
      w.__TAURI_INTERNALS__.invoke = (cmd, args = {}) => {
        if (cmd === "write_text_file" && args.path === path) {
          resolve(performance.now() - start);
          return Promise.resolve(null);
        }
        if (cmd === "file_mtime_ms" && args.path === path)
          return Promise.resolve(1);
        return original(cmd, args);
      };
    });
    w.__devEmitTauriEvent("menu-save-file");
    const ms = await written;
    w.__TAURI_INTERNALS__.invoke = original;
    return ms;
  }, path);
}

/** Write → Agent: until the Agent's preview of this document is drawn. */
async function openAgent(page: Page) {
  const start = Date.now();
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await page.waitForFunction(
    () => {
      const preview = document.querySelector(
        ".agent-workspace-layer[data-open='true'] .workspace-document",
      );
      return !!preview && (preview.textContent?.length ?? 0) > 0;
    },
    undefined,
    { timeout: STEP_CAP, polling: 200 },
  );
  const ms = Date.now() - start;
  await page.getByRole("button", { name: /^(Write|写作) ·/ }).click();
  return ms;
}

for (const size of SIZES) {
  test(`huge document ${size}`, async ({ playwright, baseURL }) => {
    // A browser of its own: a size that takes the renderer down mustn't
    // take the next sizes with it.
    const browser = await playwright.chromium.launch({
      args: ["--js-flags=--max-old-space-size=8192"],
    });
    const page = await browser.newPage({
      baseURL,
      viewport: { width: 1280, height: 820 },
      locale: "zh-CN",
    });
    let crashed = false;
    page.on("crash", () => (crashed = true));
    const dnf: string[] = [];
    const step = <T>(name: string, fn: () => Promise<T>) =>
      crashed
        ? (dnf.push(`${name}: renderer crashed earlier`), Promise.resolve(null))
        : runStep(name, dnf, fn).then((r) => {
            if (crashed) dnf.push(`${name}: renderer crashed (out of memory?)`);
            return r;
          });
    const doc = hugeDoc(size, parseSize(size), IMAGE_EVERY);
    if (process.env.PERF_KEEP_FIXTURES === "1") {
      const dir = join(resultsDir(), "fixtures");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${doc.name}.md`), doc.markdown);
    }
    const { width, height } = imageSize();
    const png = makePng(width, height);
    await page.route("http://asset.localhost/**", (route) =>
      route.fulfill({ contentType: "image/png", body: png }),
    );
    await page.addInitScript(installLongTasks);
    await page.addInitScript(installKeyLatency);
    await openApp(page, {
      settings: { language: "zh", newDocumentMode: "tab" },
    });
    const cdp = await cdpFor(page);
    const before = await metrics(cdp);
    const path = `/perf/${doc.name}.md`;

    const open = await step("open", () => openDocument(page, doc, path));
    const readyAt = open
      ? await step("ready", () => waitQuiet(page, open.start, 1000, STEP_CAP))
      : null;
    const tasks = open ? await longTasksSince(page, open.start) : null;
    const opened = open ? await step("metrics", () => metrics(cdp)) : null;
    const jump = open ? await step("jump", () => jumpToEnd(page)) : null;
    const images = open ? await step("images", () => imagesInPage(page)) : null;
    const keys = open ? await step("type", () => typeAtEnd(page, 30)) : null;
    const saved = open ? await step("save", () => save(page, path)) : null;
    const closed = open
      ? await step("close", async () => {
          await page.evaluate(() =>
            (
              window as unknown as { __devEmitTauriEvent: (n: string) => void }
            ).__devEmitTauriEvent("menu-close-tab"),
          );
          await page.waitForTimeout(2000);
          return metrics(cdp);
        })
      : null;

    // The Agent on the same document, last: it may take the renderer
    // down. The document is opened again first (not timed).
    const reopened =
      open && AGENT
        ? await step("reopen", () => openDocument(page, doc, path))
        : null;
    const agent = reopened ? await step("agent", () => openAgent(page)) : null;
    const agentMem =
      agent !== null ? await step("metrics", () => metrics(cdp)) : null;
    await browser.close().catch(() => {});

    // Budgets (README.md): per million characters, so every size is held
    // to the same rate.
    const millions = Math.max(0.1, doc.chars / 1e6);
    budget(
      `${doc.name} open, first screen (ms)`,
      open?.visible ?? null,
      1000 + 2500 * millions,
    );
    budget(
      `${doc.name} open, idle (ms)`,
      open && readyAt !== null ? readyAt - open.start : null,
      2000 + 6000 * millions,
    );
    budget(
      `${doc.name} heap (MB)`,
      opened?.heapMB ?? null,
      120 + 250 * millions,
    );
    budget(`${doc.name} key p95 (ms)`, keys ? pct(keys, 0.95) : null, 50);
    budget(
      `${doc.name} retained after close (MB)`,
      closed ? closed.heapMB - before.heapMB : null,
      20,
    );
    report(`huge-doc-${doc.name}`, [
      {
        doc: doc.name,
        chars: doc.chars,
        blocks: doc.blocks,
        images: doc.images,
        imageSize: `${width}x${height}`,
        pngKB: png.length / 1024,
        generateMs: doc.generateMs,
        openVisibleMs: open?.visible ?? null,
        openReadyMs: open && readyAt !== null ? readyAt - open.start : null,
        longTasks: tasks?.count ?? null,
        longestTaskMs: tasks?.longest ?? null,
        heapBeforeMB: before.heapMB,
        heapOpenMB: opened?.heapMB ?? null,
        nodesOpen: opened?.nodes ?? null,
        imagesInDom: images?.inDom ?? null,
        imagesDecoded: images?.decoded ?? null,
        jumpToEndMs: jump,
        keyP50Ms: keys ? pct(keys, 0.5) : null,
        keyP95Ms: keys ? pct(keys, 0.95) : null,
        saveMs: saved,
        agentOpenMs: agent,
        heapAgentMB: agentMem?.heapMB ?? null,
        heapAfterCloseMB: closed?.heapMB ?? null,
        retainedMB: closed ? closed.heapMB - before.heapMB : null,
        dnf: dnf.join("; ") || null,
      },
    ]);
  });
}
