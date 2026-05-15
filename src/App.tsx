import { useEffect } from "react";
import { Toaster } from "sonner";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { Content } from "./components/Content";
import {
  api,
  attachBackendListeners,
  attachPersistence,
} from "./lib/backend";
import { attachThemeBridge } from "./lib/theme-bridge";
import { useProjects } from "./stores/projects";
import { useSettings } from "./stores/settings";
import "./App.css";

function App() {
  useEffect(() => {
    let cancelled = false;
    let unlistenEvents: (() => void) | undefined;
    const unsubPersist = attachPersistence();
    const unsubTheme = attachThemeBridge();

    // Suppress the browser/webview default context menu (Inspect, Reload…).
    // Two carve-outs so we don't break legitimate right-click use:
    //   1. Inside form controls — needed for paste, spell suggestions, etc.
    //   2. When the user has selected text — needed for the Copy entry on
    //      logs and the project path display.
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target?.closest(
        'input, textarea, [contenteditable="true"]',
      );
      const sel = window.getSelection();
      const hasSelection = !!sel && sel.toString().length > 0;
      if (!inField && !hasSelection) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", onContextMenu);

    (async () => {
      const u = await attachBackendListeners();
      if (cancelled) {
        u();
        return;
      }
      unlistenEvents = u;

      try {
        // Settings first so theme/etc applies before UI renders project data.
        // The theme bridge subscribes to useSettings + system media query and
        // pushes the resolved value into useTheme — no manual setTheme here.
        const settings = await api.getSettings();
        if (cancelled) return;
        useSettings.getState().hydrate(settings);

        const projects = await api.listProjects();
        if (cancelled) return;
        useProjects.getState().hydrate(projects);

        const running = await api.listRunning();
        if (cancelled) return;
        for (const id of running) {
          useProjects.getState().setRunning(id, true);
        }
        // If any project is already running (e.g. from autoRun on startup),
        // land the editor on it so the header reflects its state and the
        // Run button toggles to Stop. Otherwise the user sees a fresh
        // "Untitled" draft whose id doesn't match the running one and the
        // Stop button is unreachable.
        if (running.length > 0) {
          useProjects.getState().selectProject(running[0]);
        }
      } catch (e) {
        console.error("[bootstrap] failed to load app state", e);
      }
    })();

    return () => {
      cancelled = true;
      unsubPersist();
      unsubTheme();
      document.removeEventListener("contextmenu", onContextMenu);
      unlistenEvents?.();
    };
  }, []);

  return (
    <>
      <TitleBar />
      <Sidebar />
      <Content />
      <Toaster theme="dark" position="bottom-right" />
    </>
  );
}

export default App;
