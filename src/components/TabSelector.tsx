import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, Network, Settings } from "lucide-react";
import { useView, type View } from "../stores/view";
import "./tab-selector.css";

const TABS = [
  { id: "stack", label: "Stack", Icon: LayoutGrid },
  { id: "forge", label: "Port", Icon: Network },
  { id: "settings", label: "Settings", Icon: Settings },
] as const;

export function TabSelector() {
  const active = useView((s) => s.view);
  const setView = useView((s) => s.setView);

  return (
    <div className="tab-selector">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <motion.button
            key={id}
            layout
            type="button"
            className={`tab-selector__item ${isActive ? "tab-selector__item--active" : ""}`}
            onClick={() => setView(id as View)}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
          >
            {isActive && (
              <motion.span
                className="tab-selector__indicator"
                layoutId="tab-indicator"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <motion.span layout className="tab-selector__content">
              <Icon size={14} strokeWidth={1.75} />
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.span
                    key="label"
                    initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                    animate={{ width: "auto", opacity: 1, marginLeft: 6 }}
                    exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="tab-selector__label"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}
