import { useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, CopyIcon } from "../ui/icons";
import {
  recordClipboardEntry,
  removeClipboardEntry,
  type ClipboardEntry,
} from "../clipboard/history";
import { INSERT_CLIPBOARD_TEXT_EVENT } from "../utils/events";
import { kindOf, preview } from "./clipboard-preview";
import "./clipboard-cards.css";

/**
 * One clipboard-history entry as a soft card: its words, clamped, with when
 * it was copied underneath. A click inserts it at the cursor like a paste;
 * on hover, copy puts it back on the system clipboard and × forgets it.
 */
export function ClipboardCard({
  entry,
  when,
  labels,
}: {
  entry: ClipboardEntry;
  when: string;
  labels: { insert: string; copy: string; remove: string };
}) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (set: (on: boolean) => void) => {
    set(true);
    timers.current.push(setTimeout(() => set(false), 900));
  };
  const kind = kindOf(entry.text);
  const insert = () => {
    window.dispatchEvent(
      new CustomEvent(INSERT_CLIPBOARD_TEXT_EVENT, { detail: entry.text }),
    );
    flash(setInserted);
  };
  return (
    <div
      className={`clipboard-entry${inserted ? " is-inserted" : ""}`}
      role="button"
      tabIndex={0}
      title={labels.insert}
      onClick={insert}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          insert();
        }
      }}
    >
      <span className={`clipboard-entry-text${kind ? ` is-${kind}` : ""}`}>
        {preview(entry.text)}
      </span>
      <span className="clipboard-entry-meta">
        {kind && (
          <span className="clipboard-entry-kind">
            {kind === "code" ? "Code" : "TeX"}
          </span>
        )}
        <span>{when}</span>
      </span>
      <span className="clipboard-entry-actions">
        <button
          className="clipboard-entry-action"
          title={labels.copy}
          aria-label={labels.copy}
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(entry.text);
            recordClipboardEntry(entry.text);
            flash(setCopied);
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <button
          className="clipboard-entry-action"
          title={labels.remove}
          aria-label={labels.remove}
          onClick={(e) => {
            e.stopPropagation();
            removeClipboardEntry(entry.text);
          }}
        >
          <CloseIcon />
        </button>
      </span>
    </div>
  );
}
