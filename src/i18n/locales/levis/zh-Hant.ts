import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../zh-Hant.ts. */
export const levisZhHant = {
  shortcutToggleSurface: "切換 Agent / 寫作",
  aiSuggestionsLabel: "Agent 首頁的 AI 建議",
  aiSuggestionsHint: "依目前文件產生幾則具體的起始提示，會呼叫文字模型",
  autoTitleLabel: "自動為新文件命名",
  autoTitleHint: "未命名文件在採納第一份 Agent 草稿後自動取標題，儲存更方便",
  aiDiaryLabel: "魔法日記",
  aiDiaryHint:
    "一個彩蛋，開啟後其他 AI 功能會讓位。段落末尾按 Enter 傳送，回答寫完停留 10 秒後消散，隨後繼續輸入。上下鍵回看先前回答，Esc 取消。原文始終保留在文件中。",
  defaultHomeLabel: "預設首頁",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "寫作",
  imageRotateLeft: "向左旋轉",
  imageRotateRight: "向右旋轉",
  imageViewLarge: "檢視大圖",
  imageShowPrompt: "檢視生成提示詞",
  imagePromptTitle: "生成提示詞",
  imagePromptMissing: "這張圖片不是由 Textus 生成的，或其生成記錄已不存在。",
  imageCopyPrompt: "複製提示詞",
  imageZoomOut: "縮小",
  imageZoomIn: "放大",
  imageViewerClose: "關閉",
} satisfies Translation;
