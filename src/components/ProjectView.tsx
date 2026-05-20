import { useEffect } from "react";
import { Play, Square, RotateCcw, FolderOpen, Save } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { Tooltip } from "./Tooltip";
import { CommandList } from "./CommandList";
import { InlineEditName } from "./InlineEditName";
import { LogView } from "./LogView";
import { SidePanel } from "./SidePanel";
import { useProjects, getActiveLane } from "../stores/projects";
import { useLogs } from "../stores/logs";
import { useRuns } from "../stores/runs";
import { useMetrics } from "../stores/metrics";
import { useSettings } from "../stores/settings";
import { api } from "../lib/backend";
import { toast } from "sonner";

export function ProjectView() {
  const draftId = useProjects((s) => s.draft.id);
  const path = useProjects((s) => getActiveLane(s.draft).path);
  const lanesCount = useProjects((s) => s.draft.lanes.length);
  const dirty = useProjects((s) => s.dirty);
  const editingId = useProjects((s) => s.editingId);
  const saveDraft = useProjects((s) => s.saveDraft);
  const selectProject = useProjects((s) => s.selectProject);
  const isRunning = useProjects((s) => s.runningIds.has(s.draft.id));
  const setRunning = useProjects((s) => s.setRunning);
  const confirmStop = useSettings((s) => s.settings.confirmStop);

  const canSave = dirty || editingId === null;
  const canRun = editingId !== null && !dirty;
  const canDiscard = dirty && editingId !== null;
  const canOpenFolder = path.trim().length > 0;

  async function openFolder() {
    if (!canOpenFolder) return;
    try {
      await openPath(path);
    } catch (e) {
      toast.error(`Could not open folder: ${String(e)}`);
    }
  }

  function discard() {
    if (!canDiscard || !editingId) return;
    selectProject(editingId);
  }

  async function toggleRun() {
    if (isRunning) {
      if (confirmStop) {
        const ok = window.confirm("Stop this running project?");
        if (!ok) return;
      }
      try {
        await api.stopProject(draftId);
      } catch (e) {
        toast.error(`Stop failed: ${String(e)}`);
        return;
      }
      // The watcher's proc://project terminal event will normally clear
      // runningIds, but if state was already stale (e.g. id mismatch with
      // backend, or terminal event missed during bootstrap) the UI would
      // stay stuck on "Stop". Reconcile from the source of truth.
      try {
        const stillRunning = await api.listRunning();
        const live = new Set(stillRunning);
        useProjects.getState().setRunning(draftId, live.has(draftId));
      } catch {
        // Non-fatal — leave the listener to do its job.
      }
      return;
    }
    useLogs.getState().clear(draftId);
    useRuns.getState().clearProject(draftId);
    useMetrics.getState().clear(draftId);

    const project = useProjects.getState().draft;
    setRunning(draftId, true);
    try {
      await api.startProject(project);
    } catch (e) {
      setRunning(draftId, false);
      toast.error(`Run failed: ${String(e)}`);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canSave) saveDraft();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (isRunning || canRun) {
          void toggleRun();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, canRun, isRunning, saveDraft]);

  return (
    <>
      <header className="content-header">
        <div className="content-header__title">
          <InlineEditName />
          <span className="content-header__path">
            {path || "No path selected"}
            {lanesCount > 1 && (
              <span className="content-header__lanes">
                · {lanesCount} lanes
              </span>
            )}
          </span>
        </div>
        <div className="content-header__actions">
          <Tooltip label="Open folder">
            <button
              className="content-icon-btn"
              type="button"
              aria-label="Open folder"
              onClick={openFolder}
              disabled={!canOpenFolder}
            >
              <FolderOpen size={14} strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Tooltip label="Discard changes">
            <button
              className="content-icon-btn"
              type="button"
              aria-label="Discard changes"
              onClick={discard}
              disabled={!canDiscard}
            >
              <RotateCcw size={14} strokeWidth={1.75} />
            </button>
          </Tooltip>
          <div className="content-header__sep" />
          <Tooltip label="Save" shortcut="Ctrl+S">
            <button
              className="content-save-btn"
              type="button"
              aria-label="Save"
              onClick={saveDraft}
              disabled={!canSave}
            >
              <Save size={13} strokeWidth={1.75} />
              <span>Save</span>
              {dirty && <span className="content-save-btn__dot" />}
            </button>
          </Tooltip>
          <Tooltip label={isRunning ? "Stop" : "Run"} shortcut="Ctrl+Enter">
            <button
              className={`content-play-btn ${isRunning ? "content-play-btn--running" : ""}`}
              type="button"
              aria-label={isRunning ? "Stop" : "Run"}
              onClick={toggleRun}
              disabled={!isRunning && !canRun}
            >
              {isRunning ? (
                <Square size={12} strokeWidth={1.75} fill="currentColor" />
              ) : (
                <Play size={14} strokeWidth={1.75} fill="currentColor" />
              )}
              <span>{isRunning ? "Stop" : "Run"}</span>
            </button>
          </Tooltip>
        </div>
      </header>

      <div className="content-grid">
        <div className="content-col content-col--main">
          <div className="content-pane content-pane--top">
            <CommandList />
          </div>
          <div className="content-pane content-pane--bottom">
            <LogView />
          </div>
        </div>
        <div className="content-col content-col--side">
          <div className="content-pane content-pane--side">
            <SidePanel />
          </div>
        </div>
      </div>
    </>
  );
}
