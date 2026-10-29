import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../ja.ts. */
export const levisJa = {
  shortcutToggleSurface: "Agent / 執筆を切り替え",
  aiSuggestionsLabel: "Agent ホームの AI 提案",
  aiSuggestionsHint:
    "現在の文書に合わせた具体的な書き出しの指示をいくつか作成します（テキストモデルを使用）",
  autoTitleLabel: "新しい文書に自動で名前を付ける",
  autoTitleHint:
    "無題の文書は最初に採用した Agent の下書きからタイトルを付け、保存しやすくします",
  aiDiaryLabel: "魔法の日記",
  aiDiaryHint:
    "ほかの AI 機能に代わるイースターエッグです。段落の末尾で Enter を押すと送信され、書き終えた返事は 10 秒後に消えて、また入力できます。上下キーで過去の返事を表示し、Esc で中止します。原文は文書内に残ります。",
  defaultHomeLabel: "起動時の画面",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "執筆",
} satisfies Translation;
