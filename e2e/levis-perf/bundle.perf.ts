import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { test } from "@playwright/test";
import { report, type Row } from "./probes";

/**
 * The production bundle: what every window loads before its first frame
 * (the entry chunk, which upstream caps), the whole app, and Levis' own
 * lazy chunks - the Agent surface and the Magic Diary's room - which Write
 * must never load. Built into a temporary folder.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test("production bundle", async () => {
  test.setTimeout(10 * 60_000);
  const out = mkdtempSync(join(tmpdir(), "levis-perf-build-"));
  try {
    const start = Date.now();
    execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], {
      cwd: root,
      stdio: "pipe",
    });
    const buildS = (Date.now() - start) / 1000;
    const all = files(out).map((path) => {
      const bytes = readFileSync(path);
      return {
        name: path.slice(out.length + 1),
        kb: bytes.length / 1024,
        gzipKB: gzipSync(bytes).length / 1024,
      };
    });
    const sum = (xs: typeof all) => ({
      kb: xs.reduce((s, f) => s + f.kb, 0),
      gzipKB: xs.reduce((s, f) => s + f.gzipKB, 0),
    });
    const js = all.filter((f) => f.name.endsWith(".js"));
    const css = all.filter((f) => f.name.endsWith(".css"));
    const entry = js.filter((f) => /^assets\/index-[^/]+\.js$/.test(f.name));
    const pick = (re: RegExp) => all.filter((f) => re.test(f.name));
    const rows: Row[] = [
      { part: "entry chunk (startup)", ...sum(entry), files: entry.length },
      { part: "all JavaScript", ...sum(js), files: js.length },
      { part: "all CSS", ...sum(css), files: css.length },
      {
        part: "Levis: Agent surface (lazy)",
        ...sum(pick(/AgentLayer[^/]*\.(js|css)$/)),
        files: pick(/AgentLayer[^/]*\.(js|css)$/).length,
      },
      {
        part: "Levis: Magic Diary room (lazy)",
        ...sum(pick(/DiaryRoom[^/]*\.(js|css)$/)),
        files: pick(/DiaryRoom[^/]*\.(js|css)$/).length,
      },
      { part: "build time (s)", kb: null, gzipKB: null, files: buildS },
    ];
    report("bundle", rows);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
