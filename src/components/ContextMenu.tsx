import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./context-menu.css";

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  shortcut?: string;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const MARGIN = 8;

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    if (!open || !ref.current) {
      setPos({ x, y });
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - MARGIN) {
      nx = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
    }
    if (ny + rect.height > window.innerHeight - MARGIN) {
      ny = Math.max(MARGIN, y - rect.height);
    }
    setPos({ x: nx, y: ny });
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className="context-menu"
          style={{ left: pos.x, top: pos.y }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              className={`context-menu__item ${item.variant === "danger" ? "context-menu__item--danger" : ""}`}
              onClick={() => {
                item.onClick?.();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="context-menu__shortcut">{item.shortcut}</span>
              )}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
