/** Levis' own UI strings (English, the source of truth for their keys).
 *  Spread into ../en.ts, so upstream's file changes by one line. */
export const levisEn = {
  shortcutToggleSurface: "Switch Agent / Write",
  aiSuggestionsLabel: "AI suggestions on the Agent home",
  aiSuggestionsHint:
    "Writes a few concrete starting prompts for the current document; uses the text model",
  autoTitleLabel: "Name new documents automatically",
  autoTitleHint:
    "Gives an untitled document a title from its first accepted Agent draft, so saving is one step",
  aiDiaryLabel: "Magic Diary",
  aiDiaryHint:
    "An easter egg that stands the other AI features down. Enter at the end of a paragraph sends it; the finished answer stays for 10 seconds, then fades so you can write again. Up/Down recalls earlier answers; Escape cancels. Your original text stays in the document.",
  defaultHomeLabel: "Start Page",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "Write",
} satisfies Record<string, string>;
