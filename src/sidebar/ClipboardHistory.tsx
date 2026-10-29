import { useEffect, useState } from "react";
import { useSettings } from "../prefs/SettingsContext";
import { ClipboardTabIcon } from "../ui/icons";
import {
  useClipboardHistory,
  clearClipboardHistory,
} from "../clipboard/history";
import { relativeTime } from "./clipboard-preview";
import { ClipboardCard } from "./ClipboardCard";

/**
 * Sidebar panel over the clipboard history: one card per entry, newest
 * first, with when it was copied (ClipboardCard). A click inserts an entry
 * at the cursor; copy puts it back on the system clipboard, × forgets it.
 */
export function ClipboardHistory() {
  const { t, settings } = useSettings();
  const entries = useClipboardHistory();
  // Re-read "x minutes ago" now and then while the panel is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="clipboard-empty clipboard-cards-empty">
        <ClipboardTabIcon />
        <p>{t.clipboardEmpty}</p>
      </div>
    );
  }

  return (
    <div className="clipboard-history clipboard-cards">
      <div className="clipboard-toolbar">
        <span className="clipboard-title">{t.clipboardTab}</span>
        <span className="clipboard-count">{entries.length}</span>
        <button className="clipboard-clear" onClick={clearClipboardHistory}>
          {t.clipboardClear}
        </button>
      </div>
      <div className="clipboard-list">
        {entries.map((entry) => (
          <ClipboardCard
            key={entry.text}
            entry={entry}
            when={relativeTime(entry.at, now, settings.language)}
            labels={{
              insert: t.clipboardInsertHint,
              copy: t.clipboardCopy,
              remove: t.docDelete,
            }}
          />
        ))}
      </div>
    </div>
  );
}
