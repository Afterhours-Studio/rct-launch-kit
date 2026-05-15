import { create } from "zustand";

export type Theme = "light" | "dark" | "system";
export type WindowsShell = "cmd" | "powershell";
export type CloseBehavior = "ask" | "quit" | "hide";

export interface Settings {
  theme: Theme;
  maxLogLines: number;
  autoScroll: boolean;
  showTimestamps: boolean;
  confirmDelete: boolean;
  confirmStop: boolean;
  windowsShell: WindowsShell;
  killTimeoutMs: number;
  autoCheckUpdates: boolean;
  startWithSystem: boolean;
  closeBehavior: CloseBehavior;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  maxLogLines: 2000,
  autoScroll: true,
  showTimestamps: true,
  confirmDelete: true,
  confirmStop: false,
  windowsShell: "cmd",
  killTimeoutMs: 300,
  autoCheckUpdates: false,
  startWithSystem: false,
  closeBehavior: "ask",
};

interface SettingsState {
  settings: Settings;
  /** Replace from disk (no persist round-trip). */
  hydrate: (s: Settings) => void;
  /** Local optimistic update; caller is responsible for persisting via api. */
  patch: (p: Partial<Settings>) => void;
  /** Replace and accept that this came from a confirmed save. */
  replace: (s: Settings) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  hydrate: (s) => set({ settings: s }),
  patch: (p) => set((st) => ({ settings: { ...st.settings, ...p } })),
  replace: (s) => set({ settings: s }),
}));
