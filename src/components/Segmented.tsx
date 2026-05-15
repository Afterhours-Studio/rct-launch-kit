import { useId } from "react";
import { motion } from "framer-motion";
import "./segmented.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Optional aria-label for the group. */
  ariaLabel?: string;
  /**
   * Visual size. `sm` (default) for sidebar/inline use, `md` for settings page.
   */
  size?: "sm" | "md";
  /** Stretch to fill parent width with equal-sized items. */
  block?: boolean;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "sm",
  block = false,
}: SegmentedProps<T>) {
  // Each instance needs its own layoutId so framer-motion doesn't try to
  // animate the indicator between unrelated segmented controls.
  const layoutId = useId();

  return (
    <div
      className={`segmented segmented--${size} ${block ? "segmented--block" : ""}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const isActive = o.value === value;
        return (
          <motion.button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`segmented__item ${isActive ? "is-active" : ""}`}
            onClick={() => onChange(o.value)}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
          >
            {isActive && (
              <motion.span
                className="segmented__indicator"
                layoutId={`seg-${layoutId}`}
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
              />
            )}
            <span className="segmented__content">
              {o.icon}
              <span className="segmented__label">{o.label}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
