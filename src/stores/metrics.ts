import { create } from "zustand";

export interface Metrics {
  primaryPid: number | null;
  pidCount: number;
  cpuPct: number;
  memMb: number;
  uptimeMs: number;
}

interface MetricsState {
  byProject: Map<string, Metrics>;
  set: (projectId: string, m: Metrics) => void;
  clear: (projectId: string) => void;
  for: (projectId: string) => Metrics | null;
}

export const useMetrics = create<MetricsState>((set, get) => ({
  byProject: new Map(),
  set: (projectId, m) =>
    set((s) => {
      const next = new Map(s.byProject);
      next.set(projectId, m);
      return { byProject: next };
    }),
  clear: (projectId) =>
    set((s) => {
      const next = new Map(s.byProject);
      next.delete(projectId);
      return { byProject: next };
    }),
  for: (projectId) => get().byProject.get(projectId) ?? null,
}));
