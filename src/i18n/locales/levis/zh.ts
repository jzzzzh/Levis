import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../zh.ts. */
export const levisZh = {
  shortcutToggleSurface: "切换 Agent / 写作",
  aiSuggestionsLabel: "Agent 首页的 AI 建议",
  aiSuggestionsHint: "根据当前文档生成几条具体的起始提示，会调用文本模型",
  autoTitleLabel: "自动为新文档命名",
  autoTitleHint: "未命名文档在采纳第一份 Agent 草稿后自动起标题，保存更方便",
  aiDiaryLabel: "魔法日记",
  aiDiaryHint:
    "一个彩蛋，开启后其他 AI 功能会让位。段落末尾按回车发送，回答写完停留 10 秒后消散，随后继续输入。上下键回看先前回答，Esc 取消。原文始终保留在文档中。",
  defaultHomeLabel: "默认首页",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "写作",
} satisfies Translation;
