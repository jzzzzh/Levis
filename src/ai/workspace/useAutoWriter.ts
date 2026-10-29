import { useEffect, useRef, useState } from "react";
import { ai } from "../../platform/ipc";
import { useSettings } from "../../prefs/SettingsContext";
import { errorText } from "../../utils/error-text";
import { quickText } from "./assist";
import type { AutoWriteRequest } from "./useProjectMaterial";
import {
  ensureIllustrated,
  parsePlan,
  pictureSrc,
  planMaterial,
  planningPrompt,
  sectionPrompt,
  type WritingPlan,
} from "./auto-writer";

/** What the editor lends the auto-writer: one Agent request at a time
 *  through the workspace (so every section is an ordinary reviewed draft),
 *  and the draft's accept / reject. */
export interface AutoWriterHost {
  docPath: string | null;
  busy: boolean;
  /** Sends one create-mode request; resolves once its proposals are in the
   *  draft. False when it could not be sent. */
  send: (message: string, allowImages: boolean) => Promise<boolean>;
  /** Changes waiting in the draft right now. */
  pending: () => number;
  /** The same, as of this render: a change decided in the draft (its
   *  全部采纳, a paragraph's ✓) re-renders the card. */
  pendingCount: number;
  /** How many times draft text has been accepted, by any button. */
  acceptedCount: () => number;
  acceptAll: () => void;
  rejectAll: () => void;
  stop: () => void;
}

type Phase =
  "planning" | "failed" | "outline" | "writing" | "review" | "paused" | "done";
type SectionState = "todo" | "writing" | "review" | "done" | "skipped";

/** Auto-writing's run (AutoWriter.tsx): plans the sections as soon as the
 *  request arrives, then writes them one at a time through the host. */
export function useAutoWriter(host: AutoWriterHost, request: AutoWriteRequest) {
  const { settings } = useSettings();
  const zh = settings.language.startsWith("zh");
  const root = settings.agentWorkspaceRoot || null;
  const { folder, material, pictures, extra, images } = request;
  // Asked at the outline, where the writing is about to start.
  const [eachSection, setEachSection] = useState(true);
  const [reading, setReading] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("planning");
  const [plan, setPlan] = useState<WritingPlan | null>(null);
  const [states, setStates] = useState<SectionState[]>([]);
  const [current, setCurrent] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pauseRequested = useRef(false);
  const hostRef = useRef(host);
  const idleWaiters = useRef<(() => void)[]>([]);
  useEffect(() => {
    hostRef.current = host;
    if (host.busy) return;
    const waiting = idleWaiters.current;
    idleWaiters.current = [];
    waiting.forEach((resolve) => resolve());
  });
  /** Resolves once a render has seen the previous request end: the host's
   *  send closes over that render's state and refuses while it says busy,
   *  so continuous mode cannot fire the next section straight away. */
  const hostIdle = () =>
    hostRef.current.busy
      ? new Promise<void>((resolve) => idleWaiters.current.push(resolve))
      : Promise.resolve();

  const makePlan = async () => {
    setError(null);
    setPhase("planning");
    try {
      // One at a time, saying which: a Word or PDF file takes a moment, and
      // one that can't be read is skipped rather than stopping the plan.
      const texts: { path: string; text: string }[] = [];
      for (const path of material) {
        setReading(path);
        const text = await ai
          .readProjectFile(host.docPath, root, path)
          .catch(() => null);
        if (text) texts.push({ path, text });
      }
      setReading(null);
      if (!texts.length && !extra.trim())
        throw new Error(
          zh
            ? "请写下要写什么，或在文件夹里勾选大纲和资料。"
            : "Say what to write, or tick an outline and material in the folder.",
        );
      const reply = await quickText(
        settings,
        "",
        planningPrompt(planMaterial(texts), extra, zh, images, pictures),
        crypto.randomUUID(),
      );
      const parsed = parsePlan(reply, pictures);
      const next = parsed && images ? ensureIllustrated(parsed) : parsed;
      if (!next)
        throw new Error(
          zh
            ? "没能从资料中规划出章节，请补充大纲或要求后重试。"
            : "No sections could be planned from the material; add an outline or requirements and retry.",
        );
      setPlan(next);
      setStates(next.sections.map(() => "todo"));
      setPhase("outline");
    } catch (err) {
      setReading(null);
      setError(errorText(err));
      setPhase("failed");
    }
  };
  // Planned as soon as the request arrives (once - StrictMode re-runs
  // effects, and a plan is a paid request).
  const planned = useRef<string | null>(null);
  useEffect(() => {
    if (planned.current === request.id) return;
    planned.current = request.id;
    void makePlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  const mark = (index: number, state: SectionState) =>
    setStates((prev) => prev.map((s, i) => (i === index ? state : s)));

  /** Writes section `index` (again, with `revision` notes) and either stops
   *  for review or, in continuous mode, accepts it and goes on. */
  const write = async (index: number, revision?: string) => {
    if (!plan) return;
    if (index >= plan.sections.length) {
      setPhase("done");
      return;
    }
    if (pauseRequested.current) {
      pauseRequested.current = false;
      setCurrent(index);
      setPhase("paused");
      return;
    }
    setError(null);
    setCurrent(index);
    setPhase("writing");
    mark(index, "writing");
    await hostIdle();
    // From here, any of this section's text taken counts - in the draft
    // while the Agent is still finishing its turn included.
    acceptedAtReview.current = hostRef.current.acceptedCount();
    const section = plan.sections[index];
    const sent = await hostRef.current.send(
      sectionPrompt(
        plan,
        index,
        {
          images,
          first: index === 0 && states.every((s) => s !== "done"),
          revision,
          pictureSrc:
            section.picture && folder
              ? pictureSrc(folder, section.picture, host.docPath)
              : undefined,
        },
        zh,
      ),
      images && section.image && !section.picture,
    );
    const takenAlready =
      hostRef.current.acceptedCount() > acceptedAtReview.current;
    if (sent && hostRef.current.pending() === 0 && takenAlready) {
      // Accepted before the request even ended: done, on to the next.
      mark(index, "done");
      void write(index + 1);
      return;
    }
    if (!sent || hostRef.current.pending() === 0) {
      mark(index, "todo");
      setError(
        zh
          ? "这一节没有得到可审阅的内容（请求失败或被停止）。可以重试或跳过。"
          : "This section produced nothing to review (the request failed or was stopped). Retry or skip it.",
      );
      setPhase("review");
      return;
    }
    if (eachSection) {
      mark(index, "review");
      setPhase("review");
      return;
    }
    hostRef.current.acceptAll();
    if (hostRef.current.pending() > 0) {
      // It could not go in (the document changed under it): stop here
      // rather than write the next section after a missing one.
      mark(index, "review");
      setError(
        zh
          ? "这一节没能写入文档（文档在写作期间被改动过）。可以在草稿里处理，或重写本节。"
          : "This section couldn't go into the document (it changed meanwhile). Decide it in the draft, or rewrite it.",
      );
      setPhase("review");
      return;
    }
    mark(index, "done");
    void write(index + 1);
  };

  // A section decided in the draft itself - 全部采纳 there, or every
  // paragraph taken or not - goes on like 采纳并继续 once any of it went
  // in. All of it rejected stays here: rewrite it, or skip it.
  const acceptedAtReview = useRef(0);
  // The section being written stays in view in a long outline.
  const outlineRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (phase !== "writing" && phase !== "review") return;
    outlineRef.current?.children[current]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [current, phase]);
  useEffect(() => {
    if (phase !== "review" || error || host.pendingCount > 0) return;
    if (host.acceptedCount() <= acceptedAtReview.current) return;
    mark(current, "done");
    void write(current + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, host.pendingCount, error]);
  const acceptAndContinue = () => {
    if (hostRef.current.pending() > 0) hostRef.current.acceptAll();
    // Still waiting: it did not go in (the document was typed into since
    // it was written). Say so - moving on would leave a hole in the text.
    if (hostRef.current.pending() > 0) {
      setError(
        zh
          ? "这一节没能写入：文档在审阅期间被改动过。可以按意见重写本节，或跳过。"
          : "This section couldn't go in: the document was edited during review. Rewrite it or skip it.",
      );
      return;
    }
    mark(current, "done");
    void write(current + 1);
  };
  const reviseSection = () => {
    const notes = note.trim();
    if (!notes) return;
    setNote("");
    hostRef.current.rejectAll();
    void write(current, notes);
  };
  const skipSection = () => {
    hostRef.current.rejectAll();
    mark(current, "skipped");
    void write(current + 1);
  };
  const stopAll = () => {
    pauseRequested.current = false;
    hostRef.current.stop();
    setPhase("done");
  };
  /** Pauses continuous writing before the next section. */
  const requestPause = () => {
    pauseRequested.current = true;
  };
  return {
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
  };
}
