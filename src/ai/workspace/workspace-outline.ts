import type { AgentTurn } from "../types";
import { userMessageBody } from "../chat/user-message";
import { foldToolSteps, isCardTool, toolStepCounts } from "../chat/tool-steps";
import type { ChatHistoryEntry } from "../chat/chat-history";
import { parseProposal } from "../chat/proposal";

/** An auto-writing section's request (auto-writer.ts's sectionPrompt). */
const AUTO_SECTION_LINE =
  /^(?:【自动写作 (\d+)\/(\d+)】|\[Auto-writing (\d+)\/(\d+)\])/;

/** One row of the task list's timeline. */
export interface WorkspaceStep {
  id: string;
  names: { name: string; count: number }[];
  detail: string;
  done: boolean;
}

/** One pass over the turns: tasks, tool steps and each step's result. */
export function workspaceOutline(turns: AgentTurn[]): {
  tasks: string[];
  steps: WorkspaceStep[];
} {
  const results = new Map<string, string>();
  for (const turn of turns)
    if (turn.kind === "ToolResult")
      results.set(
        turn.call_id,
        (results.has(turn.call_id) ? results.get(turn.call_id) + "\n" : "") +
          turn.output,
      );
  const tasks: string[] = [];
  // One row per run of plain tool steps ("Counting ×6 · Checking ×3",
  // tool-steps.ts), one per proposal or comment.
  const steps: WorkspaceStep[] = [];
  const { groups } = foldToolSteps(turns);
  // Auto-writing's sections are one task ("已写 3/4 节"), and only the
  // section in hand lists its steps.
  let autoTask = -1;
  turns.forEach((turn, i) => {
    if (turn.kind === "User") {
      const body = userMessageBody(turn.text);
      const auto = AUTO_SECTION_LINE.exec(body);
      if (auto) {
        const [k, n] = [auto[1] ?? auto[3], auto[2] ?? auto[4]];
        const line = auto[1]
          ? `自动写作 · 已写 ${k}/${n} 节`
          : `Auto-writing · section ${k}/${n}`;
        if (autoTask >= 0 && autoTask === tasks.length - 1)
          tasks[autoTask] = line;
        else {
          tasks.push(line);
          autoTask = tasks.length - 1;
        }
        steps.length = 0;
      } else {
        autoTask = -1;
        tasks.push(body.slice(0, 120));
      }
    }
    const run = groups.get(i);
    if (run && turn.kind === "ToolCall")
      steps.push({
        id: turn.call_id,
        names: toolStepCounts(run),
        detail: run.map((step) => step.output ?? step.arguments).join("\n\n"),
        done: run.every((step) => step.output !== null),
      });
    else if (turn.kind === "ToolCall" && !run && isCardTool(turn.name))
      steps.push({
        id: turn.call_id,
        names: [{ name: turn.name, count: 1 }],
        detail: results.get(turn.call_id) ?? turn.arguments,
        done: results.has(turn.call_id),
      });
  });
  return { tasks, steps };
}

/** A conversation saved before snapshots existed: its document rebuilt from
 *  the text the Agent proposed to write (appended and inserted passages, in
 *  order) - the best that can be done for an untitled document. */
export function textFromProposals(entry: ChatHistoryEntry): string | null {
  const parts: string[] = [];
  for (const turn of entry.turns) {
    if (turn.kind !== "ToolCall" || turn.name !== "propose_edit") continue;
    const proposal = parseProposal(turn.arguments);
    if (
      proposal?.text &&
      ["append", "insert_after", "insert_at_cursor"].includes(proposal.action)
    )
      parts.push(proposal.text.trim());
  }
  return parts.length ? parts.join("\n\n") + "\n" : null;
}

/** Puts a suggestion into the composer this workspace renders, as if typed. */
export function fillComposer(root: HTMLElement | null, text: string) {
  const input = root?.querySelector<HTMLTextAreaElement>(
    "textarea.inline-chat-input",
  );
  if (!input) return;
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
  input.setSelectionRange(text.length, text.length);
}
