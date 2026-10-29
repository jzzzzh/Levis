// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../platform/events", () => ({
  listenToThisWebview: vi.fn(),
  listenToThisWindow: vi.fn(),
  unlistenAll: vi.fn(() => () => {}),
}));
vi.mock("../platform/ipc", () => ({
  fs: {},
  session: { addRecentFile: vi.fn() },
  windowIpc: {},
}));
vi.mock("../plugins/manager", () => ({
  loadPlugins: vi.fn(async () => {}),
  revealInPluginTab: vi.fn(),
}));
vi.mock("../plugins/store/plugin-lookup", () => ({
  customEditorFor: () => null,
}));
vi.mock("../plugins/store/open-offer", () => ({
  offerForContent: vi.fn(),
  offerPluginToOpen: vi.fn(),
}));
vi.mock("../document/doc-tabs", async (original) => ({
  ...(await original<typeof import("../document/doc-tabs")>()),
  readDocFromDisk: vi.fn(async () => ({ content: "Text.", diskMtime: 1 })),
}));
import { useFileOpening } from "./useFileOpening";
import { registerWorkspaceClose } from "../document/workspace-close";
import { makeBlankTab, type DocTab } from "../document/doc-tabs";
import { setTabEngaged } from "../document/levis-tabs";
import { resolveStrings } from "../i18n/strings";
import type { TabState } from "./tabs/useTabState";

afterEach(cleanup);

function opening(tab: DocTab) {
  const updateTab = vi.fn();
  const setTabs = vi.fn();
  const tabState = {
    tabsRef: { current: [tab] },
    liveTabs: () => [tab],
    activeTabId: tab.id,
    updateTab,
    setTabs,
    setActiveTabId: vi.fn(),
  } as unknown as TabState;
  const hook = renderHook(() =>
    useFileOpening({
      tabState,
      dialogFilters: { textFilter: "", wordFilter: "", allFilter: "" },
      restoreCarets: false,
      t: resolveStrings("en"),
      onWordDocumentOpened: vi.fn(),
    }),
  );
  return { ...hook, updateTab, setTabs };
}

it("asks the tab's Agent work before replacing it, and gives it a new identity", async () => {
  const tab = { ...makeBlankTab(), workspaceId: "old-document" };
  const { result, updateTab } = opening(tab);
  let allowed = false;
  const guard = vi.fn(async () => allowed);
  const remove = registerWorkspaceClose(tab.id, guard);
  await act(() => result.current.replaceTabWithFile(tab.id, "/docs/b.md"));
  expect(guard).toHaveBeenCalled();
  expect(updateTab).not.toHaveBeenCalled();
  allowed = true;
  await act(() => result.current.replaceTabWithFile(tab.id, "/docs/b.md"));
  expect(updateTab).toHaveBeenCalledWith(
    tab.id,
    expect.objectContaining({ path: "/docs/b.md" }),
  );
  expect(updateTab.mock.calls[0][1].workspaceId).not.toBe("old-document");
  remove();
});

it("a blank tab with an Agent conversation is not replaced", async () => {
  const tab = makeBlankTab();
  setTabEngaged(tab.id, true);
  const { result, updateTab, setTabs } = opening(tab);
  await act(() => result.current.openFile("/docs/b.md"));
  expect(updateTab).not.toHaveBeenCalled();
  expect(setTabs).toHaveBeenCalledTimes(1);
  setTabEngaged(tab.id, false);
});
