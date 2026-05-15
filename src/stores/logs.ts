import { create } from "zustand";
import { useSettings } from "./settings";

export type LogStream = "stdout" | "stderr" | "system";

export interface LogLine {
  id: number;
  projectId: string;
  laneId: string;
  stepIdx: number;
  stream: LogStream;
  text: string;
  ts: number;
}

const HARD_CAP = 50_000;
const FALLBACK = 2000;
let nextId = 1;

interface LogsState {
  byProject: Map<string, LogLine[]>;
  append: (
    projectId: string,
    line: Omit<LogLine, "id" | "projectId">,
  ) => void;
  clear: (projectId: string) => void;
  for: (projectId: string) => LogLine[];
}

const EMPTY: LogLine[] = [];

function maxLines(): number {
  try {
    const n = useSettings.getState().settings.maxLogLines;
    if (Number.isFinite(n) && n > 0) {
      return Math.min(HARD_CAP, n);
    }
  } catch {
    /* settings store not ready */
  }
  return FALLBACK;
}

export const useLogs = create<LogsState>((set, get) => ({
  byProject: new Map(),
  append: (projectId, partial) =>
    set((s) => {
      const cap = maxLines();
      const m = new Map(s.byProject);
      const existing = m.get(projectId) ?? [];
      const next = [
        ...existing,
        { id: nextId++, projectId, ...partial },
      ];
      if (next.length > cap) {
        next.splice(0, next.length - cap);
      }
      m.set(projectId, next);
      return { byProject: m };
    }),
  clear: (projectId) =>
    set((s) => {
      const m = new Map(s.byProject);
      m.set(projectId, []);
      return { byProject: m };
    }),
  for: (projectId) => get().byProject.get(projectId) ?? EMPTY,
}));
