import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

export type ItemStatus = "active" | "running" | "warning" | "error" | "idle";

const STATUS_COLOR: Record<ItemStatus, string> = {
  active: "#5db872",
  running: "#5db8a6",
  warning: "#d4a017",
  error: "#c64545",
  idle: "#8e8b82",
};

interface SidebarItemProps {
  name: string;
  status: ItemStatus;
}

export function SidebarItem({ name, status }: SidebarItemProps) {
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });

  function openMenu(x: number, y: number) {
    setMenu({ open: true, x, y });
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }

  function onMoreClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4);
  }

  const items: ContextMenuItem[] = [
    { label: "Open", shortcut: "↵" },
    { label: "Rename", shortcut: "F2" },
    { label: "Duplicate", shortcut: "Ctrl+D" },
    { label: "Copy link" },
    { label: "Delete", variant: "danger", shortcut: "Del" },
  ];

  return (
    <>
      <div className="sidebar-panel__item" onContextMenu={onContextMenu}>
        <span
          className="sidebar-panel__item-ring"
          style={{ background: STATUS_COLOR[status] }}
          aria-label={status}
        />
        <span className="sidebar-panel__item-name">{name}</span>
        <button
          className="sidebar-panel__item-more"
          onClick={onMoreClick}
          aria-label="More actions"
        >
          <MoreVertical size={14} strokeWidth={2} />
        </button>
      </div>
      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={items}
        onClose={() => setMenu({ open: false, x: 0, y: 0 })}
      />
    </>
  );
}
