/** How a clipboard-history card reads an entry (ClipboardCard.tsx). */

const PREVIEW_MAX_CHARS = 140;

/** What an entry reads as at a glance: the words, without the markdown
 *  markers around them (the inserted text keeps them). */
export function preview(text: string): string {
  const flat = text
    .replace(/^\s{0,3}(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|\*|_|~~|`)(?=\S)([^\n]*?\S)\1/g, "$2")
    .replace(/^[*_]+|[*_]+$/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > PREVIEW_MAX_CHARS
    ? `${flat.slice(0, PREVIEW_MAX_CHARS)}…`
    : flat;
}

/** A tag for entries that are not plain prose. */
export function kindOf(text: string): "code" | "math" | null {
  const t = text.trim();
  if (/^```|^ {4}\S/m.test(t)) return "code";
  if (/^\$\$|^\\(begin|sub|section|input|frac|[a-z]+\{)/.test(t)) return "math";
  return null;
}

/** "3 分钟前", "yesterday": in the UI's language, no strings of our own. */
export function relativeTime(at: number, now: number, lang: string): string {
  const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
    ["year", Infinity],
  ];
  let value = Math.round((at - now) / 1000);
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size)
      return unit === "second" && Math.abs(value) < 45
        ? format.format(0, "second")
        : format.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}
