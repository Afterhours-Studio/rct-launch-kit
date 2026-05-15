import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./tooltip.css";

const DELAY = 500;
const MARGIN = 8;
const GAP = 6;

const tooltipBus = new EventTarget();
let nextTooltipId = 1;

interface TooltipProps {
  label: string;
  shortcut?: string;
  children: ReactElement;
}

interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function Tooltip({ label, shortcut, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; placement: "below" | "above" }>({
    x: 0,
    y: 0,
    placement: "below",
  });
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const idRef = useRef<number>(nextTooltipId++);

  function clearShow() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setShow(false);
  }

  useEffect(() => {
    function onOtherShow(e: Event) {
      const detail = (e as CustomEvent<{ id: number }>).detail;
      if (detail.id !== idRef.current) clearShow();
    }
    tooltipBus.addEventListener("show", onOtherShow);
    return () => tooltipBus.removeEventListener("show", onOtherShow);
  }, []);

  function onEnter(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setShow(true);
      tooltipBus.dispatchEvent(
        new CustomEvent("show", { detail: { id: idRef.current } }),
      );
    }, DELAY);
  }

  function onLeave() {
    clearShow();
  }

  useLayoutEffect(() => {
    if (!show || !anchor || !tipRef.current) return;
    const tip = tipRef.current.getBoundingClientRect();

    let centerX = anchor.left + anchor.width / 2;
    const minCenter = MARGIN + tip.width / 2;
    const maxCenter = window.innerWidth - MARGIN - tip.width / 2;
    centerX = Math.max(minCenter, Math.min(maxCenter, centerX));

    let topY = anchor.bottom + GAP;
    let placement: "below" | "above" = "below";
    if (topY + tip.height > window.innerHeight - MARGIN) {
      topY = anchor.top - tip.height - GAP;
      placement = "above";
    }

    setPos({ x: centerX, y: topY, placement });
  }, [show, anchor]);

  if (!isValidElement(children)) return children;

  const childProps = children.props as Record<string, unknown>;
  const enhanced = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      onEnter(e);
      (childProps.onMouseEnter as ((e: React.MouseEvent<HTMLElement>) => void) | undefined)?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      onLeave();
      (childProps.onMouseLeave as ((e: React.MouseEvent<HTMLElement>) => void) | undefined)?.(e);
    },
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      onLeave();
      (childProps.onMouseDown as ((e: React.MouseEvent<HTMLElement>) => void) | undefined)?.(e);
    },
  } as Partial<React.HTMLAttributes<HTMLElement>>);

  return (
    <>
      {enhanced}
      {createPortal(
        <AnimatePresence>
          {show && (
            <div
              ref={tipRef}
              className="tooltip-anchor"
              style={{ left: pos.x, top: pos.y }}
            >
              <motion.div
                className="tooltip"
                initial={{
                  opacity: 0,
                  y: pos.placement === "below" ? -4 : 4,
                }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: pos.placement === "below" ? -4 : 4,
                }}
                transition={{ duration: 0.12, ease: "easeOut" }}
              >
                <span className="tooltip__label">{label}</span>
                {shortcut && <span className="tooltip__shortcut">{shortcut}</span>}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
