import type { Translation } from "../../strings";

/** Levis' own UI strings; spread into ../de.ts. */
export const levisDe = {
  shortcutToggleSurface: "Agent / Schreiben wechseln",
  aiSuggestionsLabel: "KI-Vorschläge auf der Agent-Startseite",
  aiSuggestionsHint:
    "Schreibt einige konkrete Startanweisungen für das aktuelle Dokument; nutzt das Textmodell",
  autoTitleLabel: "Neue Dokumente automatisch benennen",
  autoTitleHint:
    "Gibt einem unbenannten Dokument nach dem ersten übernommenen Agent-Entwurf einen Titel, damit das Speichern einfacher ist",
  aiDiaryLabel: "Magisches Tagebuch",
  aiDiaryHint:
    "Ein Easter Egg, bei dem die anderen KI-Funktionen pausieren. Eingabe am Absatzende sendet den Text; die fertige Antwort bleibt 10 Sekunden, verblasst dann und gibt die Eingabe frei. Hoch/Runter zeigt frühere Antworten, Escape bricht ab. Der Originaltext bleibt im Dokument.",
  defaultHomeLabel: "Startseite",
  defaultHomeAgent: "Agent",
  defaultHomeWrite: "Schreiben",
} satisfies Translation;
