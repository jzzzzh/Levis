import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../ru.ts. */
export const levisRu = {
  shortcutToggleSurface: "Переключить Agent / Письмо",
  aiSuggestionsLabel: "ИИ-подсказки на главной Agent",
  aiSuggestionsHint:
    "Пишет несколько конкретных стартовых запросов для текущего документа; использует текстовую модель",
  autoTitleLabel: "Автоматически называть новые документы",
  autoTitleHint:
    "Даёт безымянному документу название по первому принятому черновику Agent, чтобы его было проще сохранить",
  aiDiaryLabel: "Волшебный дневник",
  aiDiaryHint:
    "Пасхалка, заменяющая остальные ИИ-функции. Enter в конце абзаца отправляет текст; готовый ответ остаётся на 10 секунд, затем исчезает, и можно писать дальше. Стрелки вверх/вниз показывают прежние ответы, Escape отменяет. Исходный текст остаётся в документе.",
  defaultHomeLabel: "Начальный экран",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "Письмо",
  imageRotateLeft: "Повернуть влево",
  imageRotateRight: "Повернуть вправо",
  imageViewLarge: "Открыть изображение",
  imageShowPrompt: "Показать промпт генерации",
  imagePromptTitle: "Промпт генерации",
  imagePromptMissing:
    "Это изображение создано не Textus, или запись о нём больше не существует.",
  imageCopyPrompt: "Скопировать промпт",
  imageZoomOut: "Уменьшить",
  imageZoomIn: "Увеличить",
  imageViewerClose: "Закрыть",
} satisfies Translation;
