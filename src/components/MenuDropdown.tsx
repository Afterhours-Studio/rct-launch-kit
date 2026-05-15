import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import "./menu-dropdown.css";

type MenuItem = { label: string; shortcut?: string };
type MenuGroup = { label: string; items: MenuItem[] };

const MENU: MenuGroup[] = [
  {
    label: "File",
    items: [
      { label: "New", shortcut: "Ctrl+N" },
      { label: "Open...", shortcut: "Ctrl+O" },
      { label: "Save", shortcut: "Ctrl+S" },
      { label: "Save As...", shortcut: "Ctrl+Shift+S" },
      { label: "Exit", shortcut: "Alt+F4" },
    ],
  },
  {
    label: "Edit",
    items: [
      { label: "Undo", shortcut: "Ctrl+Z" },
      { label: "Redo", shortcut: "Ctrl+Y" },
      { label: "Cut", shortcut: "Ctrl+X" },
      { label: "Copy", shortcut: "Ctrl+C" },
      { label: "Paste", shortcut: "Ctrl+V" },
    ],
  },
  {
    label: "View",
    items: [
      { label: "Zoom In", shortcut: "Ctrl++" },
      { label: "Zoom Out", shortcut: "Ctrl+-" },
      { label: "Reset Zoom", shortcut: "Ctrl+0" },
      { label: "Fullscreen", shortcut: "F11" },
    ],
  },
  {
    label: "Help",
    items: [
      { label: "Documentation" },
      { label: "Keyboard Shortcuts", shortcut: "Ctrl+/" },
      { label: "About" },
    ],
  },
];

interface MenuDropdownProps {
  open: boolean;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

export function MenuDropdown({ open, onClose, anchorX, anchorY }: MenuDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setOpenGroup(null);
  }, [open]);

  function submenuPos(label: string) {
    const el = itemRefs.current.get(label);
    if (!el) return { left: 0, top: 0 };
    const rect = el.getBoundingClientRect();
    return { left: rect.right + 4, top: rect.top - 4 };
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className="menu-dropdown"
          style={{ left: anchorX, top: anchorY }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          {MENU.map(({ label, items }) => (
            <button
              key={label}
              ref={(el) => {
                if (el) itemRefs.current.set(label, el);
              }}
              className={`menu-dropdown__item ${openGroup === label ? "menu-dropdown__item--open" : ""}`}
              onMouseEnter={() => setOpenGroup(label)}
              onClick={() => setOpenGroup(openGroup === label ? null : label)}
            >
              <span>{label}</span>
              <ChevronRight size={14} strokeWidth={1.75} />

              {openGroup === label &&
                createPortal(
                  <motion.div
                    className="menu-submenu"
                    style={submenuPos(label)}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {items.map((it) => (
                      <button key={it.label} className="menu-submenu__item">
                        <span>{it.label}</span>
                        {it.shortcut && (
                          <span className="menu-submenu__shortcut">{it.shortcut}</span>
                        )}
                      </button>
                    ))}
                  </motion.div>,
                  document.body,
                )}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
