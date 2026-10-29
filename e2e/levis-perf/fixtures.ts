import { deflateSync } from "node:zlib";
import { mixedDoc } from "../perf/large-docs";

/**
 * What the Levis performance suite opens: Markdown of a given size built
 * from upstream's seeded generator (headings, lists, tables, code, math,
 * quotes), with pictures of a real size spread through it - every one a
 * distinct file, so each is fetched and decoded on its own.
 */

/** "100k", "1m", "10m" or a plain number: characters. */
export function parseSize(size: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([km]?)$/i.exec(size.trim());
  if (!m) throw new Error(`Not a size: ${size}`);
  const unit = { "": 1, k: 1_000, m: 1_000_000 }[m[2].toLowerCase()]!;
  return Math.round(Number(m[1]) * unit);
}

export interface HugeDoc {
  name: string;
  markdown: string;
  chars: number;
  blocks: number;
  images: number;
  /** The first and last headings, to tell when the ends are drawn. */
  firstHeading: string;
  lastHeading: string;
  generateMs: number;
}

/** Upstream's generator writes this many characters per block on average
 *  (measured once, from a sample). */
let perBlock: number | null = null;
function charsPerBlock(): number {
  if (perBlock === null) {
    const sample = mixedDoc("zh", 2000);
    perBlock = sample.markdown.length / 2000;
  }
  return perBlock;
}

/**
 * About `chars` characters of Chinese Markdown with a picture after every
 * `imageEvery` blocks (0: none). Deterministic: the same size gives the
 * same text on every machine and branch.
 */
export function hugeDoc(
  label: string,
  chars: number,
  imageEvery: number,
): HugeDoc {
  const start = performance.now();
  const blocks = Math.max(1, Math.ceil(chars / charsPerBlock()));
  const base = mixedDoc("zh", blocks).markdown;
  const parts = base.split("\n\n");
  const out: string[] = [];
  let images = 0;
  parts.forEach((part, i) => {
    out.push(part);
    if (imageEvery > 0 && i > 0 && i % imageEvery === 0) {
      images++;
      out.push(`![插图 ${images}](images/levis-${images}.png)`);
    }
  });
  const markdown = out.join("\n\n");
  const headings = markdown.match(/^#{1,3} .+$/gm) ?? [];
  return {
    name: `${label}${imageEvery > 0 ? `-img${imageEvery}` : ""}`,
    markdown,
    chars: markdown.length,
    blocks: out.length,
    images,
    firstHeading: (headings[0] ?? "").replace(/^#+ /, ""),
    lastHeading: (headings.at(-1) ?? "").replace(/^#+ /, ""),
    generateMs: performance.now() - start,
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * An RGB PNG of `width`×`height`: soft colour blocks with a little grain
 * per 4-pixel cell, so it compresses about as well as an illustration
 * (tens of KB at 1600×1000) and decodes to width×height×4 bytes, as a real
 * picture does. Pixel-level noise made each file megabytes, and serving
 * thousands of them through the test's router became what was measured.
 */
export function makePng(width: number, height: number, seed = 1): Buffer {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const cells = new Uint8Array(Math.ceil(width / 4) * Math.ceil(height / 4));
  for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(rand() * 12);
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const bx = Math.floor(x / 64);
      const by = Math.floor(y / 64);
      const base = ((bx * 37 + by * 91) % 160) + 48;
      const grain =
        cells[Math.floor(y / 4) * Math.ceil(width / 4) + Math.floor(x / 4)];
      const at = y * row + 1 + x * 3;
      raw[at] = base + grain;
      raw[at + 1] = ((base * 7) % 200) + grain;
      raw[at + 2] = 255 - base - grain;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** PERF_IMAGE_SIZE ("1600x1000" by default) as numbers. */
export function imageSize(): { width: number; height: number } {
  const [w, h] = (process.env.PERF_IMAGE_SIZE ?? "1600x1000")
    .split("x")
    .map(Number);
  return { width: w || 1600, height: h || 1000 };
}
