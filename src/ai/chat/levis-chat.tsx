import type { ReactNode } from "react";
import type { AgentRequestOptions } from "./useAgentConversation";
import "./levis-composer.css";

/**
 * Levis' hooks into upstream's chat (the `levis` prop on ChatBody): what
 * the Agent workspace does with a send, and its tools in the composer's
 * toolbar. Without them upstream's chat is unchanged.
 */
export interface LevisChatHooks {
  /** Before a send becomes a request: "taken" when the workspace ran it
   *  itself (auto-writing), null when it isn't ready (the text goes back in
   *  the box), else the options to send with. */
  prepareSend?: (
    message: string,
    options: AgentRequestOptions,
  ) => AgentRequestOptions | "taken" | null;
  /** After upstream's buttons in the composer's toolbar. */
  toolbar?: ReactNode;
}
