import { create } from "zustand";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

const initial: Theme = (localStorage.getItem("theme") as Theme) || "light";
applyTheme(initial);

export const useTheme = create<ThemeState>((set) => ({
  theme: initial,
  setTheme: (t) => {
    applyTheme(t);
    localStorage.setItem("theme", t);
    set({ theme: t });
  },
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === "light" ? "dark" : "light";
      applyTheme(next);
      localStorage.setItem("theme", next);
      return { theme: next };
    }),
}));
