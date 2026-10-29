/**
 * Levis' commands in the dev browser and the end-to-end tests: Agent drafts
 * kept in localStorage as the backend keeps them on disk, and a canned
 * Magic Diary aside. tauri-shim.ts asks here after its canned results.
 */
let workspaceRecoveryClaimed = false;

function readWorkspaceDrafts(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem("dev-workspace-drafts") ?? "{}");
  } catch {
    return {};
  }
}

const WORKSPACE_COMMANDS = [
  "save_workspace_snapshot",
  "load_workspace_snapshot",
  "clear_workspace_snapshot",
  "take_workspace_snapshots",
];

/** The answer to a Levis command, or undefined for any other. */
export function levisShimInvoke(
  cmd: string,
  args: unknown,
): Promise<unknown> | undefined {
  const input = args as Record<string, unknown> | undefined;
  if (WORKSPACE_COMMANDS.includes(cmd)) {
    const snapshots = readWorkspaceDrafts();
    if (cmd === "take_workspace_snapshots") {
      if (workspaceRecoveryClaimed) return Promise.resolve([]);
      workspaceRecoveryClaimed = true;
      return Promise.resolve(Object.values(snapshots));
    }
    const snapshot = input?.snapshot as { documentId: string } | undefined;
    const id = snapshot?.documentId ?? String(input?.documentId ?? "");
    if (cmd === "load_workspace_snapshot")
      return Promise.resolve(snapshots[id] ?? null);
    if (cmd === "save_workspace_snapshot") snapshots[id] = snapshot;
    else delete snapshots[id];
    localStorage.setItem("dev-workspace-drafts", JSON.stringify(snapshots));
    return Promise.resolve(null);
  }
  // A canned aside, so the Magic Diary's choreography can be smoked in the
  // browser; it counts the exchanges before it, so a conversation reads as
  // one.
  if (cmd === "ai_diary_reply") {
    const line = String(input?.line ?? "");
    const history = Array.isArray(input?.history) ? input.history : [];
    const aside = history.length
      ? `Canned dev-shim aside, turn ${history.length + 1}, to: ${line}`
      : line
        ? `Canned dev-shim aside to: ${line}`
        : "Canned dev-shim aside.";
    return Promise.resolve(aside);
  }
  return undefined;
}
