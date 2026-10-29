#!/usr/bin/env node
// Compares two runs of the Levis performance suite (e2e/levis-perf):
//   node scripts/levis-perf-compare.mjs <labelA> <labelB>
// Each label is a folder under test-results/levis-perf/ (PERF_LABEL of the
// run). Prints, per report and row, every number with B's change from A.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("usage: levis-perf-compare.mjs <labelA> <labelB>");
  process.exit(1);
}
const dir = (label) => join("test-results", "levis-perf", label);
for (const label of [a, b])
  if (!existsSync(dir(label))) {
    console.error(`no results for "${label}" in ${dir(label)}`);
    process.exit(1);
  }

const round = (n) => Math.round(n * 10) / 10;
const files = readdirSync(dir(a)).filter(
  (f) => f.endsWith(".json") && existsSync(join(dir(b), f)),
);
for (const file of files) {
  const rowsA = JSON.parse(readFileSync(join(dir(a), file), "utf8"));
  const rowsB = JSON.parse(readFileSync(join(dir(b), file), "utf8"));
  console.log(`\n## ${file.replace(/\.json$/, "")}  (${a} → ${b})\n`);
  rowsA.forEach((rowA, i) => {
    const rowB = rowsB[i];
    if (!rowB) return;
    const name = Object.values(rowA).find((v) => typeof v === "string") ?? i;
    const cells = Object.keys(rowA)
      .filter((k) => typeof rowA[k] === "number" && typeof rowB[k] === "number")
      .map((k) => {
        const delta = rowB[k] - rowA[k];
        const pct = rowA[k]
          ? ` ${delta >= 0 ? "+" : ""}${round((delta / rowA[k]) * 100)}%`
          : "";
        return `${k}: ${round(rowA[k])} → ${round(rowB[k])}${pct}`;
      });
    console.log(`- **${name}**: ${cells.join(", ")}`);
  });
}
