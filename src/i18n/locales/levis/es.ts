import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../es.ts. */
export const levisEs = {
  shortcutToggleSurface: "Cambiar entre Agent y Escribir",
  aiSuggestionsLabel: "Sugerencias de IA en el inicio de Agent",
  aiSuggestionsHint:
    "Escribe algunas indicaciones concretas para el documento actual; usa el modelo de texto",
  autoTitleLabel: "Nombrar documentos nuevos automáticamente",
  autoTitleHint:
    "Da título a un documento sin nombre a partir del primer borrador de Agent aceptado, para guardarlo en un paso",
  aiDiaryLabel: "Diario mágico",
  aiDiaryHint:
    "Un huevo de pascua que da paso a este diario en lugar de las otras funciones de IA. Intro al final del párrafo lo envía; la respuesta terminada permanece 10 segundos y se desvanece para volver a escribir. Arriba/Abajo muestra respuestas anteriores; Escape cancela. El texto original permanece en el documento.",
  defaultHomeLabel: "Página de inicio",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "Escribir",
} satisfies Translation;
