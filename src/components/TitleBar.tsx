import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu, PanelLeft, Search, ArrowLeft, ArrowRight } from "lucide-react";
import { MenuDropdown } from "./MenuDropdown";
import { CommandPalette } from "./CommandPalette";
import { Tooltip } from "./Tooltip";
import { useNavigation } from "../stores/navigation";
import { useSidebar } from "../stores/sidebar";
import "./titlebar.css";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const canGoBack = useNavigation((s) => s.canGoBack);
  const canGoForward = useNavigation((s) => s.canGoForward);
  const goBack = useNavigation((s) => s.goBack);
  const goForward = useNavigation((s) => s.goForward);
  const toggleSidebar = useSidebar((s) => s.toggle);

  function toggleMenu() {
    if (!menuBtnRef.current) return;
    const rect = menuBtnRef.current.getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom + 4 });
    setMenuOpen((v) => !v);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  return (
    <>
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-cluster">
          <Tooltip label="Menu">
            <button
              ref={menuBtnRef}
              className="titlebar-icon-btn"
              onClick={toggleMenu}
              aria-label="Menu"
            >
              <Menu size={16} strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Tooltip label="Collapse sidebar" shortcut="Ctrl+B">
            <button
              className="titlebar-icon-btn"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
            >
              <PanelLeft size={16} strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Tooltip label="Search" shortcut="Ctrl+K">
            <button
              className="titlebar-icon-btn"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Search size={16} strokeWidth={1.75} />
            </button>
          </Tooltip>
          <div className="titlebar-sep" />
          <Tooltip label="Back">
            <button
              className="titlebar-icon-btn"
              onClick={goBack}
              disabled={!canGoBack}
              aria-label="Back"
            >
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Tooltip label="Forward">
            <button
              className="titlebar-icon-btn"
              onClick={goForward}
              disabled={!canGoForward}
              aria-label="Forward"
            >
              <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>

        <div className="titlebar-drag" data-tauri-drag-region />

        <div className="titlebar-controls">
          <Tooltip label="Minimize">
            <button
              className="titlebar-btn"
              onClick={() => appWindow.minimize()}
              aria-label="Minimize"
            >
              <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label="Maximize">
            <button
              className="titlebar-btn"
              onClick={() => appWindow.toggleMaximize()}
              aria-label="Maximize"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M0 0v10h10V0H0zm1 1h8v8H1V1z" fill="currentColor" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label="Close">
            <button
              className="titlebar-btn titlebar-btn--close"
              onClick={() => appWindow.close()}
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1 0L0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4L1 0z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      <MenuDropdown
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorX={menuPos.x}
        anchorY={menuPos.y}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
