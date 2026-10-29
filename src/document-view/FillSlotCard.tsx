import { useState } from "react";
import { createPortal } from "react-dom";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorRunner } from "../editor/useEditorRunner";
import type { Settings } from "../prefs/SettingsContext";
import {
  findFillSlots,
  type FillSlotRequest,
} from "../editor/fill-slots/fill-slot-plugin";
import {
  useCardPlace,
  useDismiss,
  useFillSuggestions,
} from "./useFillSlotCard";
import "../editor/fill-slots/fill-slot.css";

/**
 * Filling a blank (【开幕日期】): the text model's suggestions from the
 * document's context - the value the document gives, or candidates - one
 * click away, or your own words. The blank is replaced in one step, so
 * Undo brings it back.
 */
export function FillSlotCard({
  request,
  run,
  settings,
  onClose,
}: {
  request: FillSlotRequest;
  run: EditorRunner;
  settings: Settings;
  onClose: () => void;
}) {
  const zh = settings.language.startsWith("zh");
  const { options, failed } = useFillSuggestions(request, run, settings);
  const [own, setOwn] = useState("");
  const card = useDismiss(onClose);
  const place = useCardPlace(card, request, options);

  const fill = (value: string) => {
    const text = value.trim();
    if (!text) return;
    run((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { doc } = view.state;
      const blank = `【${request.label}】`;
      // The document may have moved since the click: find the blank again.
      const slot =
        doc.textBetween(request.from, request.to) === blank
          ? request
          : findFillSlots(doc).find((s) => s.label === request.label);
      if (!slot) return;
      view.dispatch(view.state.tr.insertText(text, slot.from, slot.to));
      view.focus();
    });
    onClose();
  };

  return createPortal(
    <div
      ref={card}
      className="fill-slot-card"
      role="dialog"
      aria-label={
        zh ? `填写「${request.label}」` : `Fill in "${request.label}"`
      }
      style={{ left: place.left, top: place.top }}
      // Its fields are small: no floating microphone over them.
      data-no-dictation
    >
      <div className="fill-slot-card-head">
        <span className="fill-slot-card-label">【{request.label}】</span>
        <span>{zh ? "AI 建议 · 点击填入" : "Suggestions · click to fill"}</span>
      </div>
      <div className="fill-slot-card-options">
        {options === null &&
          [0, 1, 2].map((i) => (
            <span key={i} className="fill-slot-card-skeleton" />
          ))}
        {options?.map((option, i) => (
          <button
            key={option}
            type="button"
            className={i === 0 ? "is-primary" : undefined}
            style={{ "--i": i } as React.CSSProperties}
            onClick={() => fill(option)}
          >
            {option}
          </button>
        ))}
        {options?.length === 0 && (
          <p className="fill-slot-card-none">
            {failed
              ? zh
                ? "没能得到建议，请直接填写。"
                : "No suggestions came back - type it in."
              : zh
                ? "文档里没有依据，请直接填写。"
                : "Nothing in the document to go on - type it in."}
          </p>
        )}
      </div>
      <form
        className="fill-slot-card-own"
        onSubmit={(event) => {
          event.preventDefault();
          fill(own);
        }}
      >
        <input
          autoFocus
          value={own}
          placeholder={zh ? "自己填写…" : "Type your own…"}
          onChange={(event) => setOwn(event.target.value)}
        />
        <button type="submit" disabled={!own.trim()}>
          {zh ? "填入" : "Fill"}
        </button>
      </form>
      <p className="fill-slot-card-note">
        {zh
          ? "建议来自 AI，事实性信息请核实。"
          : "Suggestions come from the AI - check facts."}
      </p>
    </div>,
    document.body,
  );
}
