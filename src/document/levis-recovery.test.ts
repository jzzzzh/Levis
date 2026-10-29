import { beforeEach, expect, it, vi } from "vitest";
const takeRecoveries = vi.fn();
vi.mock("../platform/ipc-levis", () => ({
  workspaceDrafts: { takeRecoveries: () => takeRecoveries() },
}));
import { withWorkspaceRecoveries } from "./levis-recovery";

beforeEach(() => takeRecoveries.mockReset());

it("joins an Agent draft to its document's text draft", async () => {
  takeRecoveries.mockResolvedValue([
    {
      documentId: "workspace-1",
      tabId: "new-tab",
      documentPath: null,
      draft: { baseMarkdown: "Old base." },
    },
  ]);
  const list = await withWorkspaceRecoveries(
    [{ tabId: "new-tab", path: null, content: "Manual edits." }],
    true,
  );
  expect(list).toEqual([
    {
      tabId: "new-tab",
      path: null,
      content: "Manual edits.",
      workspaceId: "workspace-1",
    },
  ]);
});

it("brings back an Agent draft alone as its document's tab", async () => {
  takeRecoveries.mockResolvedValue([
    {
      documentId: "document-a",
      tabId: "same-tab",
      documentPath: "/docs/a.md",
      draft: { baseMarkdown: "A base." },
    },
  ]);
  const list = await withWorkspaceRecoveries(
    [{ tabId: "same-tab", path: "/docs/b.md", content: "B unsaved." }],
    true,
  );
  expect(list[0].workspaceId).toBeUndefined();
  expect(list[1]).toMatchObject({
    path: "/docs/a.md",
    workspaceId: "document-a",
    workspaceOnly: true,
  });
});

it("asks nothing while draft recovery is off", async () => {
  expect(await withWorkspaceRecoveries([], false)).toEqual([]);
  expect(takeRecoveries).not.toHaveBeenCalled();
});
