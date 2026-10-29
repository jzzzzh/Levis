import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../ko.ts. */
export const levisKo = {
  shortcutToggleSurface: "Agent / 글쓰기 전환",
  aiSuggestionsLabel: "Agent 홈의 AI 제안",
  aiSuggestionsHint:
    "현재 문서에 맞는 구체적인 시작 프롬프트를 만듭니다(텍스트 모델 사용)",
  autoTitleLabel: "새 문서 이름 자동 지정",
  autoTitleHint:
    "제목 없는 문서는 처음 수락한 Agent 초안으로 제목을 정해 저장을 쉽게 합니다",
  aiDiaryLabel: "마법 일기",
  aiDiaryHint:
    "다른 AI 기능 대신 사용하는 이스터 에그입니다. 문단 끝에서 Enter로 보내면 답이 다 쓰인 뒤 10초 동안 머물다가 사라지고 다시 입력할 수 있습니다. 위아래 키로 이전 답을 보고 Esc로 취소합니다. 원문은 문서에 남습니다.",
  defaultHomeLabel: "시작 화면",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "글쓰기",
  imageRotateLeft: "왼쪽으로 회전",
  imageRotateRight: "오른쪽으로 회전",
  imageViewLarge: "이미지 보기",
  imageShowPrompt: "생성 프롬프트 보기",
  imagePromptTitle: "생성 프롬프트",
  imagePromptMissing: "이 이미지는 Textus가 생성하지 않았거나 기록이 없습니다.",
  imageCopyPrompt: "프롬프트 복사",
  imageZoomOut: "축소",
  imageZoomIn: "확대",
  imageViewerClose: "닫기",
} satisfies Translation;
