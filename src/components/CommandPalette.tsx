import { useEffect } from "react";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Folder,
  Plus,
  Play,
  Square,
  Save,
  RotateCcw,
  LayoutGrid,
  Code2,
  Settings,
  Sun,
  Moon,
  Monitor,
  PanelLeft,
  Minimize2,
  Maximize2,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useProjects, type Project } from "../stores/projects";
import { useView } from "../stores/view";
import { useSidebar } from "../stores/sidebar";
import { useSettings, type Theme } from "../stores/settings";
import { useLogs } from "../stores/logs";
import { useRuns } from "../stores/runs";
import { useMetrics } from "../stores/metrics";
import { api } from "../lib/backend";
import "./command-palette.css";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const appWindow = getCurrentWindow();

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  // ---- store reads (used to render conditionally) ----
  const projects = useProjects((s) => s.projects);
  const draft = useProjects((s) => s.draft);
  const dirty = useProjects((s) => s.dirty);
  const editingId = useProjects((s) => s.editingId);
  const runningIds = useProjects((s) => s.runningIds);
  const settings = useSettings((s) => s.settings);

  // ---- global Ctrl+K + Esc ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const close = () => onOpenChange(false);
  /** Wrap an action so it always closes the palette afterwards. */
  const fire = (fn: () => void | Promise<void>) => () => {
    void Promise.resolve(fn()).finally(close);
  };

  // ---- action handlers ----
  function newProject() {
    useProjects.getState().newDraft();
    useView.getState().setView("stack");
  }

  function openProject(id: string) {
    useProjects.getState().selectProject(id);
    useView.getState().setView("stack");
  }

  function saveCurrent() {
    useProjects.getState().saveDraft();
  }

  function discardCurrent() {
    if (editingId) useProjects.getState().selectProject(editingId);
  }

  async function runProject(p: Project) {
    if (runningIds.has(p.id)) return;
    useLogs.getState().clear(p.id);
    useRuns.getState().clearProject(p.id);
    useMetrics.getState().clear(p.id);
    useProjects.getState().setRunning(p.id, true);
    try {
      await api.startProject(p);
    } catch (e) {
      useProjects.getState().setRunning(p.id, false);
      toast.error(`Run failed: ${String(e)}`);
    }
  }

  async function stopProject(id: string) {
    try {
      await api.stopProject(id);
    } catch (e) {
      toast.error(`Stop failed: ${String(e)}`);
    }
  }

  async function deleteProject(id: string) {
    const p = projects.find((x) => x.id === id);
    const name = p?.name ?? "this project";
    if (settings.confirmDelete) {
      const ok = window.confirm(`Delete "${name}"? This cannot be undone.`);
      if (!ok) return;
    }
    if (runningIds.has(id)) {
      try {
        await api.stopProject(id);
      } catch {
        /* ignore */
      }
    }
    useProjects.getState().deleteProject(id);
  }

  async function setTheme(t: Theme) {
    const prev = useSettings.getState().settings;
    useSettings.getState().patch({ theme: t });
    try {
      await api.saveSettings({ ...prev, theme: t });
    } catch (e) {
      useSettings.getState().replace(prev);
      toast.error(`Save failed: ${String(e)}`);
    }
  }

  // ---- derived flags ----
  const canSave = dirty || editingId === null;
  const canRunCurrent = editingId !== null && !dirty && !runningIds.has(draft.id);
  const isCurrentRunning = runningIds.has(draft.id);
  const canDiscard = dirty && editingId !== null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="command-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={close}
        >
          <motion.div
            className="command-shell"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Command palette" className="command">
              <div className="command__input-wrap">
                <Search size={16} strokeWidth={1.75} />
                <Command.Input
                  placeholder="Search projects, run actions, navigate..."
                  className="command__input"
                  autoFocus
                />
              </div>
              <Command.List className="command__list">
                <Command.Empty className="command__empty">
                  No results found.
                </Command.Empty>

                {/* ---- Actions on the current draft ---- */}
                <Command.Group value="g-actions" heading="Actions" className="command__group">
                  <Command.Item
                    value="new project create"
                    className="command__item"
                    onSelect={fire(newProject)}
                  >
                    <Plus size={14} />
                    <span>New project</span>
                  </Command.Item>
                  {canSave && (
                    <Command.Item
                      value="save current draft"
                      className="command__item"
                      onSelect={fire(saveCurrent)}
                    >
                      <Save size={14} />
                      <span>Save current</span>
                      <Kbd>Ctrl+S</Kbd>
                    </Command.Item>
                  )}
                  {canDiscard && (
                    <Command.Item
                      value="discard changes revert"
                      className="command__item"
                      onSelect={fire(discardCurrent)}
                    >
                      <RotateCcw size={14} />
                      <span>Discard changes</span>
                    </Command.Item>
                  )}
                  {canRunCurrent && (
                    <Command.Item
                      value="run current play start"
                      className="command__item"
                      onSelect={fire(() => runProject(draft))}
                    >
                      <Play size={14} fill="currentColor" />
                      <span>Run current</span>
                      <Kbd>Ctrl+Enter</Kbd>
                    </Command.Item>
                  )}
                  {isCurrentRunning && (
                    <Command.Item
                      value="stop current"
                      className="command__item"
                      onSelect={fire(() => stopProject(draft.id))}
                    >
                      <Square size={12} fill="currentColor" />
                      <span>Stop current</span>
                      <Kbd>Ctrl+Enter</Kbd>
                    </Command.Item>
                  )}
                </Command.Group>

                {/* ---- Project list (open) ---- */}
                {projects.length > 0 && (
                  <Command.Group value="g-projects" heading="Projects" className="command__group">
                    {projects.map((p) => {
                      const running = runningIds.has(p.id);
                      return (
                        <Command.Item
                          key={`open-${p.id}`}
                          value={`open project ${p.name}`}
                          className="command__item"
                          onSelect={fire(() => openProject(p.id))}
                        >
                          <Folder size={14} />
                          <span>{p.name}</span>
                          {running && (
                            <span className="command__badge command__badge--running">
                              running
                            </span>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {/* ---- Run / Stop per project ---- */}
                {projects.length > 0 && (
                  <Command.Group
                    value="g-run-stop"
                    heading="Run / Stop"
                    className="command__group"
                  >
                    {projects.map((p) =>
                      runningIds.has(p.id) ? (
                        <Command.Item
                          key={`stop-${p.id}`}
                          value={`stop ${p.name}`}
                          className="command__item"
                          onSelect={fire(() => stopProject(p.id))}
                        >
                          <Square size={12} fill="currentColor" />
                          <span>Stop "{p.name}"</span>
                        </Command.Item>
                      ) : (
                        <Command.Item
                          key={`run-${p.id}`}
                          value={`run start ${p.name}`}
                          className="command__item"
                          onSelect={fire(() => runProject(p))}
                        >
                          <Play size={14} fill="currentColor" />
                          <span>Run "{p.name}"</span>
                        </Command.Item>
                      ),
                    )}
                  </Command.Group>
                )}

                {/* ---- Delete ---- */}
                {projects.length > 0 && (
                  <Command.Group
                    value="g-manage"
                    heading="Manage"
                    className="command__group"
                  >
                    {projects.map((p) => (
                      <Command.Item
                        key={`del-${p.id}`}
                        value={`delete remove ${p.name}`}
                        className="command__item command__item--danger"
                        onSelect={fire(() => deleteProject(p.id))}
                      >
                        <Trash2 size={13} />
                        <span>Delete "{p.name}"</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* ---- Navigate ---- */}
                <Command.Group value="g-navigate" heading="Navigate" className="command__group">
                  <Command.Item
                    value="go to stack projects"
                    className="command__item"
                    onSelect={fire(() => useView.getState().setView("stack"))}
                  >
                    <LayoutGrid size={14} />
                    <span>Go to Stack</span>
                  </Command.Item>
                  <Command.Item
                    value="go to forge"
                    className="command__item"
                    onSelect={fire(() => useView.getState().setView("forge"))}
                  >
                    <Code2 size={14} />
                    <span>Go to Forge</span>
                  </Command.Item>
                  <Command.Item
                    value="go to settings preferences"
                    className="command__item"
                    onSelect={fire(() => useView.getState().setView("settings"))}
                  >
                    <Settings size={14} />
                    <span>Go to Settings</span>
                  </Command.Item>
                </Command.Group>

                {/* ---- Theme ---- */}
                <Command.Group value="g-theme" heading="Theme" className="command__group">
                  <Command.Item
                    value="theme light"
                    className="command__item"
                    onSelect={fire(() => setTheme("light"))}
                  >
                    <Sun size={14} />
                    <span>Theme: Light</span>
                    {settings.theme === "light" && (
                      <span className="command__check">✓</span>
                    )}
                  </Command.Item>
                  <Command.Item
                    value="theme dark"
                    className="command__item"
                    onSelect={fire(() => setTheme("dark"))}
                  >
                    <Moon size={14} />
                    <span>Theme: Dark</span>
                    {settings.theme === "dark" && (
                      <span className="command__check">✓</span>
                    )}
                  </Command.Item>
                  <Command.Item
                    value="theme system auto"
                    className="command__item"
                    onSelect={fire(() => setTheme("system"))}
                  >
                    <Monitor size={14} />
                    <span>Theme: System</span>
                    {settings.theme === "system" && (
                      <span className="command__check">✓</span>
                    )}
                  </Command.Item>
                </Command.Group>

                {/* ---- Window ---- */}
                <Command.Group value="g-window" heading="Window" className="command__group">
                  <Command.Item
                    value="toggle sidebar collapse"
                    className="command__item"
                    onSelect={fire(() => useSidebar.getState().toggle())}
                  >
                    <PanelLeft size={14} />
                    <span>Toggle sidebar</span>
                    <Kbd>Ctrl+B</Kbd>
                  </Command.Item>
                  <Command.Item
                    value="minimize window"
                    className="command__item"
                    onSelect={fire(() => appWindow.minimize())}
                  >
                    <Minimize2 size={14} />
                    <span>Minimize</span>
                  </Command.Item>
                  <Command.Item
                    value="maximize window restore"
                    className="command__item"
                    onSelect={fire(() => appWindow.toggleMaximize())}
                  >
                    <Maximize2 size={14} />
                    <span>Maximize / Restore</span>
                  </Command.Item>
                  <Command.Item
                    value="close window quit exit"
                    className="command__item command__item--danger"
                    onSelect={fire(() => appWindow.close())}
                  >
                    <X size={14} />
                    <span>Close window</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="command__kbd">{children}</span>;
}
