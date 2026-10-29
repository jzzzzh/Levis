// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  diffBlocks,
  lazyImages,
  splitBlocks,
  windowedPreview,
} from "./windowed-preview";

describe("splitBlocks", () => {
  it("splits on blank lines, keeping fences and indented continuations", () => {
    expect(
      splitBlocks(
        "# T\n\nOne.\nStill one.\n\n```\na\n\nb\n```\n\n- item\n\n  more\n\n$$\nx\n\ny\n$$\n\nEnd.",
      ),
    ).toEqual([
      "# T",
      "One.\nStill one.",
      "```\na\n\nb\n```",
      "- item\n\n  more",
      "$$\nx\n\ny\n$$",
      "End.",
    ]);
  });
});

describe("diffBlocks", () => {
  const kinds = (a: string[], b: string[]) =>
    diffBlocks(a, b).map((s) => `${s.kind[0]}${s.text}`);

  it("finds inserts, removals and rewrites between unchanged blocks", () => {
    expect(kinds(["a", "b", "c", "d"], ["a", "x", "c", "d", "e"])).toEqual([
      "sa",
      "rb",
      "ax",
      "sc",
      "sd",
      "ae",
    ]);
    expect(kinds(["a", "b", "c"], ["b", "c"])).toEqual(["ra", "sb", "sc"]);
    expect(kinds(["a", "b", "c", "d", "e"], ["a", "b", "y", "d", "z"])).toEqual(
      ["sa", "sb", "rc", "ay", "sd", "re", "az"],
    );
  });
});

describe("windowedPreview", () => {
  const doc = Array.from({ length: 4000 }, (_, i) => `Paragraph ${i}.`);

  it("windows a document into chunks to draw later", () => {
    const { html, changes, chunks } = windowedPreview(null, doc.join("\n\n"));
    expect(changes).toBe(0);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toBe(doc.join("\n\n"));
    expect(html).not.toContain("Paragraph");
  });

  it("draws the draft's changes with context, the rest in chunks", () => {
    const next = [...doc];
    next.splice(2000, 0, "New one.");
    const { html, changes, chunks } = windowedPreview(
      doc.join("\n\n"),
      next.join("\n\n"),
    );
    expect(changes).toBe(1);
    expect(html).toContain('<p class="draft-added">New one.</p>');
    expect(html).toContain("<p>Paragraph 1999.</p>");
    expect(html).toContain("<p>Paragraph 2001.</p>");
    expect(html).not.toContain("Paragraph 1990.");
    expect(chunks.join("\n\n")).toContain("Paragraph 1990.");
  });
});

describe("lazyImages", () => {
  it("loads pictures lazily, decoded off the main thread", () => {
    expect(lazyImages('<p><img src="a.png"></p>')).toBe(
      '<p><img loading="lazy" decoding="async" src="a.png"></p>',
    );
  });
});
