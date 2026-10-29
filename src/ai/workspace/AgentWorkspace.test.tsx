// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentConversation } from "../chat/useAgentConversation";
import type { DocumentDraft } from "./document-draft";
const saved = {
  id: "saved",
  docPath: "/docs/a.md",
  title: "Saved task",
  updatedAt: 1,
};
// The list holds summaries; a task's turns are read when it opens.
vi.mock("../chat/chat-history", () => ({
  useChatHistory: () => [saved],
  findConversation: async (id: string) =>
    id === saved.id ? { ...saved, turns: [] } : undefined,
  deleteConversation: vi.fn(),
  saveConversation: vi.fn(),
}));
import { AgentWorkspace } from "./AgentWorkspace";
afterEach(cleanup);
it("restores a saved task but protects a pending draft from history switches", async () => {
  const restore = vi.fn();
  const conversation = {
    history: [],
    streaming: null,
    conversationId: "current",
    busy: false,
    restore,
    reset: vi.fn(),
    stop: vi.fn(),
  } as unknown as AgentConversation;
  const props = {
    language: "en",
    title: "a.md",
    documentPath: "/docs/a.md",
    draft: null,
    preview: "",
    conflict: false,
    conversation,
    onEditor: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    children: null,
  };
  const draft = {
    baseMarkdown: "",
    operations: [
      { callId: "c", proposal: { action: "append", text: "More." } },
    ],
  } as unknown as DocumentDraft;
  const { rerender } = render(<AgentWorkspace {...props} draft={draft} />);
  fireEvent.click(screen.getByRole("button", { name: "Saved task" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(restore).not.toHaveBeenCalled();
  rerender(<AgentWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Saved task" }));
  await waitFor(() => expect(restore).toHaveBeenCalledWith("saved", []));
});

it("shows the document's pictures from their paths, as the editor does", () => {
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ =
    { convertFileSrc: (path: string) => `asset://localhost/${path}` };
  const conversation = {
    history: [],
    streaming: null,
    conversationId: "current",
    busy: false,
    restore: vi.fn(),
    reset: vi.fn(),
    stop: vi.fn(),
  } as unknown as AgentConversation;
  const { container } = render(
    <AgentWorkspace
      language="en"
      documentPath="/docs/a.md"
      draft={null}
      preview={
        "# Lake\n\n![Saved](assets/lake.jpg)\n\n![Unsaved](/Users/me/Library/assets/hill.jpg)"
      }
      conflict={false}
      conversation={conversation}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    >
      {null}
    </AgentWorkspace>,
  );
  const sources = [
    ...container.querySelectorAll<HTMLImageElement>(".workspace-document img"),
  ].map((img) => img.getAttribute("src"));
  expect(sources).toEqual([
    "asset://localhost//docs/assets/lake.jpg",
    "asset://localhost//Users/me/Library/assets/hill.jpg",
  ]);
});
