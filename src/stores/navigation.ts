import { create } from "zustand";

interface NavigationState {
  history: string[];
  index: number;
  canGoBack: boolean;
  canGoForward: boolean;
  push: (route: string) => void;
  goBack: () => void;
  goForward: () => void;
}

export const useNavigation = create<NavigationState>((set) => ({
  history: [],
  index: -1,
  canGoBack: false,
  canGoForward: false,
  push: (route) =>
    set((s) => {
      const trimmed = s.history.slice(0, s.index + 1);
      const next = [...trimmed, route];
      return {
        history: next,
        index: next.length - 1,
        canGoBack: next.length - 1 > 0,
        canGoForward: false,
      };
    }),
  goBack: () =>
    set((s) => {
      if (s.index <= 0) return s;
      const i = s.index - 1;
      return {
        ...s,
        index: i,
        canGoBack: i > 0,
        canGoForward: true,
      };
    }),
  goForward: () =>
    set((s) => {
      if (s.index >= s.history.length - 1) return s;
      const i = s.index + 1;
      return {
        ...s,
        index: i,
        canGoBack: true,
        canGoForward: i < s.history.length - 1,
      };
    }),
}));
