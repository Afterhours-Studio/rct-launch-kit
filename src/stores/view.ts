import { create } from "zustand";

export type View = "stack" | "forge" | "settings";

interface ViewState {
  view: View;
  setView: (v: View) => void;
}

export const useView = create<ViewState>((set) => ({
  view: "stack",
  setView: (v) => set({ view: v }),
}));
