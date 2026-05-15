import { create } from "zustand";

export interface Command {
  id: string;
  command: string;
  delayMs: number;
}

export interface Lane {
  id: string;
  path: string;
  commands: Command[];
}

export type RunMode = "sequential" | "parallel";

export interface Project {
  id: string;
  name: string;
  lanes: Lane[];
  activeLaneId: string;
  mode: RunMode;
  stopOnError: boolean;
  autoRestart: boolean;
  autoRun: boolean;
}

export const MAX_LANES = 3;

let nextCmdId = 1;
let nextLaneId = 1;
let nextProjectId = 1;
const newCmdId = () => `cmd-${nextCmdId++}`;
const newLaneId = () => `lane-${nextLaneId++}`;
const newProjectId = () => `prj-${nextProjectId++}`;

const DEFAULT_NAME = "Untitled project";

function makeLane(): Lane {
  return {
    id: newLaneId(),
    path: "",
    commands: [{ id: newCmdId(), command: "", delayMs: 0 }],
  };
}

function makeDraft(): Project {
  const lane = makeLane();
  return {
    id: newProjectId(),
    name: DEFAULT_NAME,
    lanes: [lane],
    activeLaneId: lane.id,
    mode: "sequential",
    stopOnError: true,
    autoRestart: false,
    autoRun: false,
  };
}

function cloneProject(p: Project): Project {
  return {
    ...p,
    lanes: p.lanes.map((l) => ({
      ...l,
      commands: l.commands.map((c) => ({ ...c })),
    })),
  };
}

/** Return the currently-active lane, or the first lane as a safe fallback. */
export function getActiveLane(p: Project): Lane {
  return p.lanes.find((l) => l.id === p.activeLaneId) ?? p.lanes[0];
}

interface ProjectsState {
  projects: Project[];
  draft: Project;
  editingId: string | null;
  dirty: boolean;
  runningIds: Set<string>;

  newDraft: () => void;
  selectProject: (id: string) => void;
  updateDraft: (
    patch: Partial<
      Pick<
        Project,
        "name" | "mode" | "stopOnError" | "autoRestart" | "autoRun"
      >
    >,
  ) => void;
  /** Replace the whole projects list (used by initial hydrate from disk). */
  hydrate: (projects: Project[]) => void;

  // Lane CRUD
  setActiveLane: (laneId: string) => void;
  addLane: () => void;
  removeLane: (laneId: string) => void;
  updateLane: (
    laneId: string,
    patch: Partial<Pick<Lane, "path">>,
  ) => void;

  // Commands on active lane
  addCommand: () => void;
  updateCommand: (
    cmdId: string,
    patch: Partial<Omit<Command, "id">>,
  ) => void;
  removeCommand: (cmdId: string) => void;
  reorderCommand: (fromIdx: number, toIdx: number) => void;

  saveDraft: () => void;
  deleteProject: (id: string) => void;
  setRunning: (id: string, running: boolean) => void;
}

function mapActiveLane(p: Project, fn: (l: Lane) => Lane): Project {
  return {
    ...p,
    lanes: p.lanes.map((l) => (l.id === p.activeLaneId ? fn(l) : l)),
  };
}

export const useProjects = create<ProjectsState>((set) => ({
  projects: [],
  draft: makeDraft(),
  editingId: null,
  dirty: false,
  runningIds: new Set<string>(),

  newDraft: () =>
    set(() => ({ draft: makeDraft(), editingId: null, dirty: false })),

  hydrate: (loaded) =>
    set(() => {
      // Re-seed id counters past any persisted ids so newly-minted ids don't collide.
      let maxPrj = 0;
      let maxLane = 0;
      let maxCmd = 0;
      const num = (s: string, prefix: string) => {
        if (!s.startsWith(prefix)) return 0;
        const n = parseInt(s.slice(prefix.length), 10);
        return Number.isFinite(n) ? n : 0;
      };
      for (const p of loaded) {
        maxPrj = Math.max(maxPrj, num(p.id, "prj-"));
        for (const l of p.lanes) {
          maxLane = Math.max(maxLane, num(l.id, "lane-"));
          for (const c of l.commands) {
            maxCmd = Math.max(maxCmd, num(c.id, "cmd-"));
          }
        }
      }
      nextProjectId = Math.max(nextProjectId, maxPrj + 1);
      nextLaneId = Math.max(nextLaneId, maxLane + 1);
      nextCmdId = Math.max(nextCmdId, maxCmd + 1);
      return { projects: loaded };
    }),

  selectProject: (id) =>
    set((s) => {
      const found = s.projects.find((p) => p.id === id);
      if (!found) return s;
      return { draft: cloneProject(found), editingId: id, dirty: false };
    }),

  updateDraft: (patch) =>
    set((s) => ({ draft: { ...s.draft, ...patch }, dirty: true })),

  // ---- Lane CRUD ----

  setActiveLane: (laneId) =>
    set((s) => {
      if (!s.draft.lanes.some((l) => l.id === laneId)) return s;
      return { draft: { ...s.draft, activeLaneId: laneId } };
    }),

  addLane: () =>
    set((s) => {
      if (s.draft.lanes.length >= MAX_LANES) return s;
      const lane = makeLane();
      return {
        draft: {
          ...s.draft,
          lanes: [...s.draft.lanes, lane],
          activeLaneId: lane.id,
        },
        dirty: true,
      };
    }),

  removeLane: (laneId) =>
    set((s) => {
      if (s.draft.lanes.length <= 1) return s;
      const nextLanes = s.draft.lanes.filter((l) => l.id !== laneId);
      const wasActive = s.draft.activeLaneId === laneId;
      return {
        draft: {
          ...s.draft,
          lanes: nextLanes,
          activeLaneId: wasActive ? nextLanes[0].id : s.draft.activeLaneId,
        },
        dirty: true,
      };
    }),

  updateLane: (laneId, patch) =>
    set((s) => ({
      draft: {
        ...s.draft,
        lanes: s.draft.lanes.map((l) =>
          l.id === laneId ? { ...l, ...patch } : l,
        ),
      },
      dirty: true,
    })),

  // ---- Commands (operate on active lane) ----

  addCommand: () =>
    set((s) => ({
      draft: mapActiveLane(s.draft, (l) => ({
        ...l,
        commands: [
          ...l.commands,
          { id: newCmdId(), command: "", delayMs: 0 },
        ],
      })),
      dirty: true,
    })),

  updateCommand: (cmdId, patch) =>
    set((s) => ({
      draft: mapActiveLane(s.draft, (l) => ({
        ...l,
        commands: l.commands.map((c) =>
          c.id === cmdId ? { ...c, ...patch } : c,
        ),
      })),
      dirty: true,
    })),

  removeCommand: (cmdId) =>
    set((s) => {
      const active = getActiveLane(s.draft);
      if (active.commands.length <= 1) return s;
      return {
        draft: mapActiveLane(s.draft, (l) => ({
          ...l,
          commands: l.commands.filter((c) => c.id !== cmdId),
        })),
        dirty: true,
      };
    }),

  reorderCommand: (fromIdx, toIdx) =>
    set((s) => {
      if (fromIdx === toIdx) return s;
      const active = getActiveLane(s.draft);
      if (fromIdx < 0 || toIdx < 0) return s;
      if (fromIdx >= active.commands.length || toIdx >= active.commands.length)
        return s;
      const next = active.commands.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return {
        draft: mapActiveLane(s.draft, (l) => ({ ...l, commands: next })),
        dirty: true,
      };
    }),

  // ---- Persistence ----

  saveDraft: () =>
    set((s) => {
      const snapshot = cloneProject(s.draft);
      const idx = s.projects.findIndex((p) => p.id === snapshot.id);
      const next =
        idx >= 0
          ? s.projects.map((p, i) => (i === idx ? snapshot : p))
          : [...s.projects, snapshot];
      return {
        projects: next,
        editingId: snapshot.id,
        dirty: false,
      };
    }),

  deleteProject: (id) =>
    set((s) => {
      const projects = s.projects.filter((p) => p.id !== id);
      const runningIds = new Set(s.runningIds);
      runningIds.delete(id);
      if (s.editingId === id) {
        return {
          projects,
          draft: makeDraft(),
          editingId: null,
          dirty: false,
          runningIds,
        };
      }
      return { projects, runningIds };
    }),

  setRunning: (id, running) =>
    set((s) => {
      const next = new Set(s.runningIds);
      if (running) next.add(id);
      else next.delete(id);
      return { runningIds: next };
    }),
}));
