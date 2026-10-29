import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../pt.ts. */
export const levisPt = {
  shortcutToggleSurface: "Alternar Agent / Escrever",
  aiSuggestionsLabel: "Sugestões de IA no início do Agent",
  aiSuggestionsHint:
    "Escreve algumas instruções concretas para o documento atual; usa o modelo de texto",
  autoTitleLabel: "Nomear novos documentos automaticamente",
  autoTitleHint:
    "Dá título a um documento sem nome a partir do primeiro rascunho do Agent aceito, para salvar em um passo",
  aiDiaryLabel: "Diário mágico",
  aiDiaryHint:
    "Um ovo de Páscoa que dá lugar ao diário em vez das outras funções de IA. Enter no fim do parágrafo envia o texto; a resposta concluída fica 10 segundos e desvanece-se para voltar a escrever. Cima/Baixo mostra respostas anteriores; Escape cancela. O texto original permanece no documento.",
  defaultHomeLabel: "Página inicial",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "Escrever",
} satisfies Translation;
