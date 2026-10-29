import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@playwright/test";
import { hugeDoc, imageSize, makePng, parseSize } from "./fixtures";
import { report, type Row } from "./probes";

/**
 * The real app, not the browser: launch time to idle and the memory of the
 * whole process tree - Rust plus the system WebView's processes - empty,
 * and opening huge documents with their pictures on disk. Sampled with
 * `ps` every 200 ms, so it works on any build without instrumenting it.
 *
 * Needs a built app: LEVIS_APP=path/to/the/executable, e.g.
 *   src-tauri/target/release/textus  (after `npx tauri build --no-bundle`)
 *   /Applications/Textus.app/Contents/MacOS/Textus
 * Quit any running Textus first (one instance hands files to the other).
 * Runs under a throw-away HOME, so your settings and session are neither
 * read nor touched. macOS and Linux.
 *
 * Env: PERF_NATIVE_SIZES (default "1m,10m"; "" for the empty launch only),
 * PERF_IMAGE_EVERY, PERF_IMAGE_SIZE, PERF_NATIVE_CAP_S (default 300).
 */

const APP = process.env.LEVIS_APP;
const SIZES = (process.env.PERF_NATIVE_SIZES ?? "1m,10m")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const IMAGE_EVERY = Number(process.env.PERF_IMAGE_EVERY ?? 40);
const CAP_MS = (Number(process.env.PERF_NATIVE_CAP_S) || 300) * 1000;

interface Proc {
  pid: number;
  ppid: number;
  rssKB: number;
  cpuS: number;
  ageS: number;
  name: string;
}

/** "[[dd-]hh:]mm:ss(.cc)" as seconds. */
function seconds(t: string): number {
  const [days, rest] = t.includes("-") ? t.split("-") : ["0", t];
  return (
    Number(days) * 86400 +
    rest
      .split(":")
      .map(Number)
      .reduce((acc, n) => acc * 60 + n, 0)
  );
}

function processes(): Proc[] {
  const out = execFileSync(
    "ps",
    ["-A", "-o", "pid=,ppid=,rss=,time=,etime=,comm="],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((f) => f.length >= 6)
    .map((f) => ({
      pid: Number(f[0]),
      ppid: Number(f[1]),
      rssKB: Number(f[2]),
      cpuS: seconds(f[3]),
      ageS: seconds(f[4]),
      name: f.slice(5).join(" "),
    }));
}

/** The app and its descendants, plus macOS's WebKit services (launched by
 *  launchd, not by the app) started since the launch. */
function tree(root: number, launchedS: number): Proc[] {
  const all = processes();
  const ids = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of all)
      if (!ids.has(p.pid) && ids.has(p.ppid)) {
        ids.add(p.pid);
        grew = true;
      }
  }
  return all.filter(
    (p) =>
      ids.has(p.pid) ||
      (/com\.apple\.WebKit|WebKitWebProcess|WebKitNetworkProcess/.test(
        p.name,
      ) &&
        p.ageS <= launchedS + 1),
  );
}

async function measure(args: string[], home: string) {
  const child: ChildProcess = spawn(APP!, args, {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") },
    stdio: "ignore",
  });
  const launched = Date.now();
  const samples: { t: number; rssMB: number; cpuS: number; n: number }[] = [];
  let pids = new Set<number>();
  let ready: number | null = null;
  try {
    while (Date.now() - launched < CAP_MS) {
      await new Promise((r) => setTimeout(r, 200));
      const t = (Date.now() - launched) / 1000;
      const procs = tree(child.pid!, t);
      pids = new Set([...pids, ...procs.map((p) => p.pid)]);
      samples.push({
        t,
        rssMB: procs.reduce((s, p) => s + p.rssKB, 0) / 1024,
        cpuS: procs.reduce((s, p) => s + p.cpuS, 0),
        n: procs.length,
      });
      // Idle: under 3% of a core for the last 3 seconds, after the first.
      const back = samples.filter((s) => s.t >= t - 3);
      if (t > 4 && back.length > 10) {
        const used = back.at(-1)!.cpuS - back[0].cpuS;
        if (used / (back.at(-1)!.t - back[0].t) < 0.03) {
          ready = back[0].t;
          break;
        }
      }
    }
  } finally {
    for (const pid of pids)
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    await new Promise((r) => setTimeout(r, 1500));
  }
  const settled = samples.filter((s) => s.t >= samples.at(-1)!.t - 3);
  return {
    readyS: ready,
    peakMB: Math.max(...samples.map((s) => s.rssMB)),
    settledMB:
      settled.reduce((sum, s) => sum + s.rssMB, 0) /
      Math.max(1, settled.length),
    processes: Math.max(...samples.map((s) => s.n)),
    cpuS: samples.at(-1)?.cpuS ?? 0,
  };
}

test("native app: launch and huge documents", async () => {
  test.skip(
    !APP || !existsSync(APP),
    "set LEVIS_APP to a built Textus executable",
  );
  test.skip(process.platform === "win32", "macOS and Linux only");
  test.setTimeout(60 * 60_000);
  const work = mkdtempSync(join(tmpdir(), "levis-perf-native-"));
  try {
    const rows: Row[] = [];
    const empty = await measure([], mkdtempSync(join(work, "home-")));
    rows.push({ case: "empty launch", chars: 0, images: 0, ...empty });

    const { width, height } = imageSize();
    const png = makePng(width, height);
    for (const size of SIZES) {
      const doc = hugeDoc(size, parseSize(size), IMAGE_EVERY);
      const dir = join(work, doc.name);
      mkdirSync(join(dir, "images"), { recursive: true });
      const file = join(dir, `${doc.name}.md`);
      writeFileSync(file, doc.markdown);
      // Every picture its own file, all hard links to one: no disk to spare.
      const first = join(dir, "images", "levis-1.png");
      writeFileSync(first, png);
      for (let i = 2; i <= doc.images; i++)
        linkSync(first, join(dir, "images", `levis-${i}.png`));
      const result = await measure([file], mkdtempSync(join(work, "home-")));
      rows.push({
        case: `open ${doc.name}`,
        chars: doc.chars,
        images: doc.images,
        ...result,
      });
    }
    report("native", rows);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
