import { Suspense } from "react";
import { createPortal } from "react-dom";
import { SurfaceSwitch } from "../../ai/workspace/SurfaceSwitch";
import { lazyModule } from "../../lazy/lazy-module";
import { lazyComponent } from "../../lazy/lazy-component";
import { formatCombo } from "../../utils/shortcuts";
import { WritePlayback } from "../WritePlayback";
import { FillSlotCard } from "../FillSlotCard";
import {
  useLevisWorkspace,
  type LevisWorkspaceProps,
} from "./useLevisWorkspace";

// The Agent surface loads the first time it opens: Write never pays for it.
const AgentLayer = lazyComponent(
  lazyModule("levis-agent", () => import("./AgentLayer")),
  (m) => m.AgentLayer,
);

/**
 * Levis' layer over one tab's editor (MilkdownEditor renders it last): the
 * Agent | Write switch and read-aloud in the window bar, the Agent surface
 * over the pane with its draft and conversation, and fill-in cards.
 */
export function LevisWorkspace(props: LevisWorkspaceProps) {
  const levis = useLevisWorkspace(props);
  const { settings, surface, chrome } = levis;
  const { workspace } = surface;
  const { isActive, phone, tour } = props;
  const { paneEl } = props.review;
  const zh = settings.language.startsWith("zh");
  const slots = chrome.barSlots;
  return (
    <>
      {!phone &&
        slots?.start &&
        isActive &&
        createPortal(
          <SurfaceSwitch
            agent={workspace.open}
            zh={zh}
            docTitle={props.docTitle}
            shortcut={formatCombo(settings.shortcuts.toggleSurface)}
            onChange={surface.switchSurface}
          />,
          slots.start,
        )}
      {slots?.end &&
        isActive &&
        !workspace.open &&
        tour === null &&
        createPortal(
          <WritePlayback reader={levis.reader} language={settings.language} />,
          slots.end,
        )}
      {surface.mounted &&
        paneEl &&
        createPortal(
          <Suspense fallback={null}>
            <AgentLayer levis={levis} />
          </Suspense>,
          paneEl,
        )}
      {chrome.fillRequest && (
        <FillSlotCard
          request={chrome.fillRequest}
          run={props.setup.run}
          settings={settings}
          onClose={chrome.closeFill}
        />
      )}
    </>
  );
}
