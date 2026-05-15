import { create } from "zustand";

export type StepState = "pending" | "running" | "done" | "failed" | "skipped";
export type LaneState = "idle" | "running" | "done" | "failed" | "stopped";
export type ProjectState =
  | "idle"
  | "running"
  | "done"
  | "failed"
  | "stopped";

export interface StepRow {
  state: StepState;
  exitCode: number | null;
  elapsedMs: number;
}

interface RunsState {
  /** keyed by `${projectId}:${laneId}:${stepIdx}` */
  steps: Map<string, StepRow>;
  /** keyed by `${projectId}:${laneId}` */
  lanes: Map<string, LaneState>;
  /** keyed by `${projectId}` */
  projects: Map<string, ProjectState>;

  setStep: (
    projectId: string,
    laneId: string,
    stepIdx: number,
    patch: Partial<StepRow>,
  ) => void;
  setLane: (projectId: string, laneId: string, state: LaneState) => void;
  setProject: (projectId: string, state: ProjectState) => void;
  clearProject: (projectId: string) => void;
}

function defaultStep(): StepRow {
  return { state: "pending", exitCode: null, elapsedMs: 0 };
}

export const useRuns = create<RunsState>((set) => ({
  steps: new Map(),
  lanes: new Map(),
  projects: new Map(),

  setStep: (projectId, laneId, stepIdx, patch) =>
    set((s) => {
      const key = `${projectId}:${laneId}:${stepIdx}`;
      const m = new Map(s.steps);
      const cur = m.get(key) ?? defaultStep();
      m.set(key, { ...cur, ...patch });
      return { steps: m };
    }),

  setLane: (projectId, laneId, state) =>
    set((s) => {
      const m = new Map(s.lanes);
      m.set(`${projectId}:${laneId}`, state);
      return { lanes: m };
    }),

  setProject: (projectId, state) =>
    set((s) => {
      const m = new Map(s.projects);
      m.set(projectId, state);
      return { projects: m };
    }),

  clearProject: (projectId) =>
    set((s) => {
      const steps = new Map(s.steps);
      const lanes = new Map(s.lanes);
      for (const k of [...steps.keys()]) {
        if (k.startsWith(`${projectId}:`)) steps.delete(k);
      }
      for (const k of [...lanes.keys()]) {
        if (k.startsWith(`${projectId}:`)) lanes.delete(k);
      }
      return { steps, lanes };
    }),
}));
