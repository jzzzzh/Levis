import { CloseIcon, ImageFileIcon } from "../../ui/icons";
import type { AutoWriteRequest } from "./useProjectMaterial";
import { useAutoWriter, type AutoWriterHost } from "./useAutoWriter";

export type { AutoWriterHost } from "./useAutoWriter";

const LABELS: Record<string, [string, string]> = {
  title: ["自动写作", "Auto-writing"],
  retry: ["重试", "Retry"],
  each: ["每写完一节暂停审阅", "Pause for review after each section"],
  planning: ["正在规划章节…", "Planning the sections…"],
  reading: ["正在读取", "Reading"],
  start: ["开始写作", "Start writing"],
  replan: ["重新规划", "Plan again"],
  writing: ["正在写作", "Writing"],
  review: [
    "这一节已写好。在草稿里采纳后会自动写下一节。",
    "This section is ready. Accept it in the draft and the next one starts.",
  ],
  accept: ["采纳并继续", "Accept and continue"],
  revise: ["按意见重写本节", "Rewrite this section"],
  note: [
    "修改意见，例如：更口语一些，加一个例子",
    "Notes, e.g. more conversational, add an example",
  ],
  skip: ["跳过本节", "Skip"],
  pause: ["暂停", "Pause"],
  resume: ["继续写作", "Continue"],
  stop: ["结束", "Stop"],
  done: ["写作完成", "Finished"],
  close: ["关闭", "Close"],
  picture: ["本节配图", "Picture for this section"],
  noPicture: ["不配图", "No picture"],
};

/** Auto-writing, started from the Agent's composer: a send in Create mode
 *  with project material picked (ProjectChip) - the folder, the ticked
 *  files and pictures, and the message as the extra requirements. The card
 *  plans the sections straight away, then shows the outline and each
 *  section's progress and review. */
export function AutoWriter({
  host,
  request,
  onClose,
}: {
  host: AutoWriterHost;
  request: AutoWriteRequest;
  onClose: () => void;
}) {
  const {
    zh,
    eachSection,
    setEachSection,
    reading,
    phase,
    plan,
    setPlan,
    states,
    setStates,
    current,
    note,
    setNote,
    error,
    outlineRef,
    makePlan,
    write,
    acceptAndContinue,
    reviseSection,
    skipSection,
    stopAll,
    requestPause,
  } = useAutoWriter(host, request);
  const { pictures, extra } = request;
  const working = phase === "planning" || phase === "writing";
  const done = states.filter((s) => s === "done").length;
  const label = (key: string) => LABELS[key][zh ? 0 : 1];

  return (
    <section className="auto-writer" aria-label={label("title")}>
      <header>
        <strong>✦ {label("title")}</strong>
        {plan && (
          <span className="auto-writer-progress">
            {done}/{plan.sections.length}
          </span>
        )}
        <button
          type="button"
          className="auto-writer-close"
          aria-label={label("close")}
          disabled={working}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      {extra.trim() && (
        <p className="auto-writer-request" title={extra}>
          {extra}
        </p>
      )}

      {phase === "planning" && (
        <p className="auto-writer-status">
          <span className="auto-writer-spinner" aria-hidden />
          {reading
            ? `${label("reading")} ${reading.split("/").pop()}…`
            : label("planning")}
        </p>
      )}

      {plan && phase !== "planning" && phase !== "failed" && (
        <>
          {plan.title && <p className="auto-writer-doc-title">{plan.title}</p>}
          <ol
            ref={outlineRef}
            className={`auto-writer-outline${phase === "outline" ? "" : " is-running"}`}
          >
            {plan.sections.map((section, i) => (
              <li key={i} className={`is-${states[i]}`}>
                <span className="auto-writer-mark" aria-hidden />
                <span className="auto-writer-section">
                  {phase === "outline" ? (
                    <input
                      value={section.title}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          sections: plan.sections.map((s, j) =>
                            j === i ? { ...s, title: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  ) : (
                    <strong>{section.title}</strong>
                  )}
                  {section.brief && <small>{section.brief}</small>}
                </span>
                {phase === "outline" && pictures.length > 0 ? (
                  <select
                    className="auto-writer-picture"
                    aria-label={label("picture")}
                    title={label("picture")}
                    value={section.picture ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPlan({
                        ...plan,
                        sections: plan.sections.map((s, j) =>
                          j === i ? { ...s, picture: value || undefined } : s,
                        ),
                      });
                    }}
                  >
                    <option value="">{label("noPicture")}</option>
                    {pictures.map((path) => (
                      <option key={path} value={path}>
                        {path.split("/").pop()}
                      </option>
                    ))}
                  </select>
                ) : (
                  section.picture && (
                    <span className="auto-writer-picture-tag">
                      <ImageFileIcon />
                      <span>{section.picture.split("/").pop()}</span>
                    </span>
                  )
                )}
                {phase === "outline" && (
                  <button
                    type="button"
                    className="auto-writer-remove"
                    aria-label={zh ? "删除这一节" : "Remove section"}
                    onClick={() => {
                      setPlan({
                        ...plan,
                        sections: plan.sections.filter((_, j) => j !== i),
                      });
                      setStates((prev) => prev.filter((_, j) => j !== i));
                    }}
                  >
                    <CloseIcon />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {phase === "outline" && (
        <div className="auto-writer-actions">
          <label className="auto-writer-option auto-writer-each">
            <input
              type="checkbox"
              className="ui-check"
              checked={eachSection}
              onChange={(e) => setEachSection(e.target.checked)}
            />
            {label("each")}
          </label>
          <button type="button" onClick={() => void makePlan()}>
            {label("replan")}
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={host.busy || !plan?.sections.length}
            onClick={() => void write(0)}
          >
            {label("start")}
          </button>
        </div>
      )}

      {phase === "writing" && (
        <div className="auto-writer-actions">
          <p className="auto-writer-status">
            <span className="auto-writer-spinner" aria-hidden />
            {label("writing")} · {plan?.sections[current]?.title}
          </p>
          {!eachSection && (
            <button type="button" onClick={requestPause}>
              {label("pause")}
            </button>
          )}
          <button type="button" className="is-quiet" onClick={stopAll}>
            {label("stop")}
          </button>
        </div>
      )}

      {phase === "review" && (
        <div className="auto-writer-review">
          {error ? (
            <p className="auto-writer-error" role="alert">
              {error}
            </p>
          ) : (
            <p>{label("review")}</p>
          )}
          <div className="auto-writer-revise">
            <input
              value={note}
              placeholder={label("note")}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  reviseSection();
              }}
            />
            <button
              type="button"
              disabled={!note.trim() || host.busy}
              onClick={reviseSection}
            >
              {label("revise")}
            </button>
          </div>
          <div className="auto-writer-actions">
            <button type="button" className="is-quiet" onClick={stopAll}>
              {label("stop")}
            </button>
            <button type="button" onClick={skipSection} disabled={host.busy}>
              {label("skip")}
            </button>
            {error ? (
              <button
                type="button"
                className="is-primary"
                disabled={host.busy}
                onClick={() => void write(current)}
              >
                {zh ? "重试本节" : "Retry"}
              </button>
            ) : (
              <button
                type="button"
                className="is-primary"
                disabled={host.busy}
                onClick={acceptAndContinue}
              >
                {label("accept")}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "paused" && (
        <div className="auto-writer-actions">
          <button type="button" className="is-quiet" onClick={stopAll}>
            {label("stop")}
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => void write(current)}
          >
            {label("resume")}
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="auto-writer-actions">
          <p className="auto-writer-status">✓ {label("done")}</p>
          <button type="button" onClick={onClose}>
            {label("close")}
          </button>
        </div>
      )}

      {phase === "failed" && (
        <div className="auto-writer-review">
          <p className="auto-writer-error" role="alert">
            {error}
          </p>
          <div className="auto-writer-actions">
            <button type="button" className="is-quiet" onClick={onClose}>
              {label("close")}
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => void makePlan()}
            >
              {label("retry")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
