/** Levis' own settings, kept apart from upstream's `Settings` so a rebase
 *  onto Textus touches one `extends` and one spread (settings-types.ts). */

/** What a new window opens on: the Agent's home or the page (Write). */
export type DefaultHome = "agent" | "write";

export interface LevisSettings {
  /// Agent home: starting prompts written by the text model for the
  /// current document (cached per document state).
  enableAiSuggestions: boolean;
  /// An untitled document takes a title from its first accepted Agent
  /// draft (its first heading, or one the model suggests).
  autoTitleDocuments: boolean;
  /// The Magic Diary: a finished line dissolves and the page answers it in
  /// another hand (ai/magic-diary). Off by default - it takes the Enter key
  /// at the end of a paragraph, which is the one key a writer uses to mean
  /// "next paragraph". Nothing is deleted either way; see the plugin.
  enableMagicDiary: boolean;
  /// The surface a window starts on: Write (default, as upstream) or the
  /// Agent home.
  defaultHome: DefaultHome;
}

export const LEVIS_DEFAULTS: LevisSettings = {
  enableAiSuggestions: true,
  autoTitleDocuments: false,
  enableMagicDiary: false,
  defaultHome: "write",
};

/** The AI features that write into the page, one at a time with the diary. */
const OTHER_AI_FEATURES = [
  "enableCompletion",
  "enableGrammarCheck",
  "enableAskAi",
  "enableWebSearch",
] as const;

type AiSwitches = Partial<
  Record<(typeof OTHER_AI_FEATURES)[number] | "enableMagicDiary", unknown>
>;

/** The one invariant: with the diary on, none of the rest can be. Pure, so
 *  it can settle the defaults and anything read from disk - the two places
 *  a settings blob can arrive describing two voices on one line, neither of
 *  them through a toggle press. */
export function diaryExclusive<T extends AiSwitches>(value: T): T {
  if (value.enableMagicDiary !== true) return value;
  const next = { ...value };
  for (const key of OTHER_AI_FEATURES) next[key] = false as T[typeof key];
  return next;
}

/** The same rule as a policy for a toggle: the last switch moved wins, so
 *  switching the diary off does not quietly bring ghost text back. Read off
 *  `patch` alone, so "switched on" is never guessed from a field the caller
 *  did not touch, and so this stays safe to call twice. */
export function exclusiveAi<T extends AiSwitches>(patch: T): T {
  if (patch.enableMagicDiary === true) return diaryExclusive(patch);
  if (OTHER_AI_FEATURES.some((key) => patch[key] === true))
    return { ...patch, enableMagicDiary: false };
  return patch;
}
