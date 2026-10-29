import type { ReactNode, RefObject } from "react";
import type { AgentRequestOptions } from "./useAgentConversation";
import { InlineDictation } from "../../voice/InlineDictation";
import "./levis-composer.css";

/**
 * Levis' hooks into upstream's chat: what the Agent workspace does with a
 * send, and what it adds to the composer's toolbar. One optional prop on
 * ChatBody (`levis`) and one on ChatComposer, so upstream's chat is
 * unchanged without them.
 */
export interface LevisChatHooks {
  /** Before a send becomes a request: "taken" when the workspace ran it
   *  itself (auto-writing), null when it isn't ready (the text goes back in
   *  the box), else the options to send with (an image permission). */
  prepareSend?: (
    message: string,
    options: AgentRequestOptions,
  ) => AgentRequestOptions | "taken" | null;
  composer?: LevisComposerSlots;
}

export interface LevisComposerSlots {
  /** Leads the toolbar after upstream's buttons: the Agent's tools. */
  toolbar?: ReactNode;
  /** Dictation into the box, in this language; none without it. */
  voiceLanguage?: string;
  /** Dictation listens only while the surface is shown. */
  active?: boolean;
}

/** The composer toolbar's Levis part: the host's tools and dictation. */
export function LevisComposerTools({
  slots,
  busy,
  input,
  setInput,
  inputRef,
}: {
  slots: LevisComposerSlots;
  busy: boolean;
  input: string;
  setInput: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <>
      {slots.toolbar}
      {slots.voiceLanguage && (
        <InlineDictation
          active={(slots.active ?? true) && !busy}
          language={slots.voiceLanguage}
          value={input}
          inputRef={inputRef}
          onChange={setInput}
        />
      )}
    </>
  );
}
