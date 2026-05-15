import { create } from "zustand";

const KEY_WIDTH = "sidebar-width";
const KEY_COLLAPSED = "sidebar-collapsed";
const DEFAULT_WIDTH = 240;

interface SidebarState {
  collapsed: boolean;
  width: number;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  setWidth: (w: number) => void;
}

const initialWidth = (() => {
  const v = Number(localStorage.getItem(KEY_WIDTH));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_WIDTH;
})();

const initialCollapsed = localStorage.getItem(KEY_COLLAPSED) === "1";

export const useSidebar = create<SidebarState>((set) => ({
  collapsed: initialCollapsed,
  width: initialWidth,
  toggle: () =>
    set((s) => {
      const next = !s.collapsed;
      localStorage.setItem(KEY_COLLAPSED, next ? "1" : "0");
      return { collapsed: next };
    }),
  setCollapsed: (v) => {
    localStorage.setItem(KEY_COLLAPSED, v ? "1" : "0");
    set({ collapsed: v });
  },
  setWidth: (w) => {
    localStorage.setItem(KEY_WIDTH, String(w));
    set({ width: w });
  },
}));
