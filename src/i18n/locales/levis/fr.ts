import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../fr.ts. */
export const levisFr = {
  shortcutToggleSurface: "Basculer Agent / Écrire",
  aiSuggestionsLabel: "Suggestions IA sur l’accueil d’Agent",
  aiSuggestionsHint:
    "Rédige quelques consignes concrètes pour le document en cours ; utilise le modèle de texte",
  autoTitleLabel: "Nommer automatiquement les nouveaux documents",
  autoTitleHint:
    "Donne un titre à un document sans nom à partir du premier brouillon d’Agent accepté, pour l’enregistrer en une étape",
  aiDiaryLabel: "Diary magique",
  aiDiaryHint:
    "Une surprise qui remplace les autres fonctions d’IA. Entrée en fin de paragraphe envoie le texte ; la réponse terminée reste 10 secondes, puis s’efface pour vous laisser écrire. Haut/Bas rappelle les réponses précédentes ; Échap annule. Le texte original reste dans le document.",
  defaultHomeLabel: "Page d’accueil",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "Écrire",
} satisfies Translation;
