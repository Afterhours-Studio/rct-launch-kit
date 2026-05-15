import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjects, type Project } from "../stores/projects";
import { useLogs, type LogStream } from "../stores/logs";
import {
  useRuns,
  type LaneState,
  type ProjectState,
  type StepState,
} from "../stores/runs";
import { useMetrics, type Metrics } from "../stores/metrics";
import type { Settings } from "../stores/settings";

export interface UpdateInfo {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
  notes: string | null;
  source: "github" | "local";
}

// ---------- invoke wrappers ----------

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  saveProjects: (projects: Project[]) =>
    invoke<void>("save_projects", { projects }),
  startProject: (project: Project) =>
    invoke<void>("start_project", { project }),
  stopProject: (projectId: string) =>
    invoke<void>("stop_project", { projectId }),
  listRunning: () => invoke<string[]>("list_running"),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    invoke<void>("save_settings", { settings }),
  resetSettings: () => invoke<Settings>("reset_settings"),
  checkUpdate: () => invoke<UpdateInfo>("check_update"),
};

export async function pickDirectory(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  if (typeof result === "string") return result;
  return null;
}

// ---------- event payload types ----------

interface LineEvent {
  projectId: string;
  laneId: string;
  stepIdx: number;
  stream: LogStream;
  text: string;
  ts: number;
}

interface StepEvent {
  projectId: string;
  laneId: string;
  stepIdx: number;
  state: StepState;
  exitCode: number | null;
  elapsedMs: number;
}

interface LaneEvent {
  projectId: string;
  laneId: string;
  state: LaneState;
  pid: number | null;
}

interface ProjectEvent {
  projectId: string;
  state: ProjectState;
}

interface MetricsEvent extends Metrics {
  projectId: string;
}

// ---------- persistence ----------

/**
 * Persist the saved-projects list to disk whenever it changes.
 *
 * The very first emission (i.e. the hydrate that loads from disk) is skipped,
 * since saving what we just loaded is wasteful and can race with the load.
 */
export function attachPersistence(): () => void {
  let lastSaved = useProjects.getState().projects;
  let isFirst = true;

  return useProjects.subscribe((s) => {
    if (s.projects === lastSaved) return;
    lastSaved = s.projects;
    if (isFirst) {
      // The first change is hydrate() right after bootstrap. Don't re-save it.
      isFirst = false;
      return;
    }
    api.saveProjects(s.projects).catch((e) => {
      console.error("[persist] failed to save projects", e);
    });
  });
}

// ---------- event listener wiring ----------

export async function attachBackendListeners(): Promise<UnlistenFn> {
  const unlistens: UnlistenFn[] = [];

  unlistens.push(
    await listen<LineEvent>("proc://line", (e) => {
      const { projectId, laneId, stepIdx, stream, text, ts } = e.payload;
      useLogs.getState().append(projectId, {
        laneId,
        stepIdx,
        stream,
        text,
        ts,
      });
    }),
  );

  unlistens.push(
    await listen<StepEvent>("proc://step", (e) => {
      const { projectId, laneId, stepIdx, state, exitCode, elapsedMs } =
        e.payload;
      useRuns.getState().setStep(projectId, laneId, stepIdx, {
        state,
        exitCode,
        elapsedMs,
      });
    }),
  );

  unlistens.push(
    await listen<LaneEvent>("proc://lane", (e) => {
      const { projectId, laneId, state } = e.payload;
      useRuns.getState().setLane(projectId, laneId, state);
    }),
  );

  unlistens.push(
    await listen<ProjectEvent>("proc://project", (e) => {
      const { projectId, state } = e.payload;
      useRuns.getState().setProject(projectId, state);
      if (state !== "running") {
        useProjects.getState().setRunning(projectId, false);
        useMetrics.getState().clear(projectId);
      }
    }),
  );

  unlistens.push(
    await listen<MetricsEvent>("proc://metrics", (e) => {
      const { projectId, ...m } = e.payload;
      useMetrics.getState().set(projectId, m);
    }),
  );

  return () => {
    unlistens.forEach((u) => u());
  };
}
