import { useRef, useState } from "react";
import { ComposerMenu, type ComposerMenuItem } from "../chat/ComposerMenu";
import { SparkleIcon } from "../../ui/levis-icons";

/**
 * The Agent composer's own tools (project folder, writing in sections),
 * in the toolbar of upstream's composer: one button opening a menu, and a
 * chip for each switch that is on - one click turns it off again.
 */
export function AgentTools({
  items,
  zh,
}: {
  items: ComposerMenuItem[];
  zh: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = zh ? "Agent 工具" : "Agent tools";
  const off = zh ? "点击关闭" : "Click to turn off";
  return (
    <span className="levis-agent-tools-host">
      {open && (
        <ComposerMenu
          label={label}
          trigger={trigger}
          sections={[
            {
              title: zh ? "添加" : "Add",
              items: items.filter((item) => item.section === "add"),
            },
            {
              title: zh ? "工具" : "Tools",
              items: items.filter((item) => item.section !== "add"),
            },
          ]}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) trigger.current?.focus();
          }}
        />
      )}
      <button
        ref={trigger}
        type="button"
        className="inline-chat-attach levis-agent-tools"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
      >
        <SparkleIcon />
      </button>
      {items
        .filter((item) => item.on)
        .map((item) => (
          <button
            key={item.key}
            type="button"
            className="composer-chip"
            aria-pressed="true"
            title={`${item.label} · ${off}`}
            disabled={item.disabled}
            onClick={item.select}
          >
            <span className="composer-chip-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.chip ?? item.label}
          </button>
        ))}
    </span>
  );
}
