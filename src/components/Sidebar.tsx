import { useRef, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Plus, MoreVertical } from "lucide-react";
import { TabSelector } from "./TabSelector";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useTheme } from "../stores/theme";
import { useSidebar } from "../stores/sidebar";
import { useProjects } from "../stores/projects";
import { useSettings } from "../stores/settings";
import { api } from "../lib/backend";
import { toast } from "sonner";
import "./sidebar.css";

const MIN_WIDTH = 224;
const MAX_WIDTH = 480;
const GAP = 8;

export function Sidebar() {
  const isResizing = useRef(false);
  const theme = useTheme((s) => s.theme);

  // The footer button flips the EFFECTIVE theme — but writes to user
  // preference so the change sticks across reloads and trumps any "system"
  // setting the user had picked.
  async function toggle() {
    const next = theme === "light" ? "dark" : "light";
    const prev = useSettings.getState().settings;
    useSettings.getState().patch({ theme: next });
    try {
      await api.saveSettings({ ...prev, theme: next });
    } catch (e) {
      useSettings.getState().replace(prev);
      toast.error(`Save failed: ${String(e)}`);
    }
  }
  const collapsed = useSidebar((s) => s.collapsed);
  const width = useSidebar((s) => s.width);
  const setWidth = useSidebar((s) => s.setWidth);
  const projects = useProjects((s) => s.projects);
  const editingId = useProjects((s) => s.editingId);
  const newDraft = useProjects((s) => s.newDraft);
  const selectProject = useProjects((s) => s.selectProject);
  const deleteProject = useProjects((s) => s.deleteProject);
  const runningIds = useProjects((s) => s.runningIds);
  const longPanelRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const [menu, setMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    projectId: string | null;
  }>({ open: false, x: 0, y: 0, projectId: null });

  function openMenu(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY, projectId });
  }

  function openMenuFromButton(
    e: React.MouseEvent<HTMLButtonElement>,
    projectId: string,
  ) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ open: true, x: r.left, y: r.bottom + 4, projectId });
  }

  async function onDelete(projectId: string) {
    if (useSettings.getState().settings.confirmDelete) {
      const project = projects.find((p) => p.id === projectId);
      const name = project?.name ?? "this project";
      const ok = window.confirm(`Delete "${name}"? This cannot be undone.`);
      if (!ok) return;
    }
    // If running, stop it first.
    if (runningIds.has(projectId)) {
      try {
        await api.stopProject(projectId);
      } catch {
        /* ignore — proceed with local delete anyway */
      }
    }
    deleteProject(projectId);
  }

  const menuItems: ContextMenuItem[] = menu.projectId
    ? [
        {
          label: "Open",
          onClick: () => menu.projectId && selectProject(menu.projectId),
        },
        {
          label: "Delete",
          variant: "danger",
          onClick: () => menu.projectId && onDelete(menu.projectId),
        },
      ]
    : [];

  useEffect(() => {
    const panel = longPanelRef.current;
    if (!panel || collapsed) return;
    const onScroll = () => {
      panel.classList.add("is-scrolling");
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = window.setTimeout(() => {
        panel.classList.remove("is-scrolling");
      }, 800);
    };
    panel.addEventListener("scroll", onScroll);
    return () => {
      panel.removeEventListener("scroll", onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [collapsed]);

  useEffect(() => {
    const w = collapsed ? 0 : width;
    document.documentElement.style.setProperty("--sidebar-width", `${w}px`);
    document.documentElement.style.setProperty(
      "--sidebar-gap",
      collapsed ? "0px" : "8px",
    );
  }, [width, collapsed]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - GAP));
      setWidth(next);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <>
      <AnimatePresence>
        {!collapsed && (
          <motion.aside
            key="sidebar"
            className="sidebar"
            style={{ width }}
            initial={{ x: -(width + 16), opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -(width + 16), opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
        >
          <div className="sidebar-top">
            <TabSelector />
          </div>
          <div className="sidebar-body">
            <div className="sidebar-panel sidebar-panel--short">
              <div className="sidebar-actions">
                <button
                  className="sidebar-action sidebar-action--primary"
                  type="button"
                  onClick={newDraft}
                >
                  <Plus size={14} strokeWidth={2.25} />
                  <span>New project</span>
                </button>
              </div>
            </div>
            <div ref={longPanelRef} className="sidebar-panel sidebar-panel--long">
              {projects.length === 0 ? (
                <div className="sidebar-empty">No projects yet</div>
              ) : (
                projects.map((p) => {
                  const isRunning = runningIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      className={`sidebar-project ${editingId === p.id ? "sidebar-project--active" : ""} ${isRunning ? "sidebar-project--running" : ""}`}
                      onClick={() => selectProject(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectProject(p.id);
                        }
                      }}
                      onContextMenu={(e) => openMenu(e, p.id)}
                    >
                      <span className="sidebar-project__ring" />
                      <span className="sidebar-project__name">{p.name}</span>
                      <button
                        type="button"
                        className="sidebar-project__more"
                        aria-label="More actions"
                        onClick={(e) => openMenuFromButton(e, p.id)}
                      >
                        <MoreVertical size={14} strokeWidth={2} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="sidebar-footer">
            <span className="sidebar-footer__copy">© h1dr0n</span>
            <button
              className="sidebar-footer__theme"
              onClick={toggle}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <Moon size={14} strokeWidth={2} />
              ) : (
                <Sun size={14} strokeWidth={2} />
              )}
            </button>
          </div>
          <div className="sidebar-resize-handle" onMouseDown={startResize} />
        </motion.aside>
      )}
      </AnimatePresence>
      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={menuItems}
        onClose={() =>
          setMenu({ open: false, x: 0, y: 0, projectId: null })
        }
      />
    </>
  );
}
