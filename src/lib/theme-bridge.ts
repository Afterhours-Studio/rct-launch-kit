import { useSettings } from "../stores/settings";
import { useTheme, type Theme as EffectiveTheme } from "../stores/theme";

/**
 * Resolve the user's preference into an effective light/dark value the DOM
 * can render. "system" follows the OS via `prefers-color-scheme`.
 */
function resolveEffective(): EffectiveTheme {
  const pref = useSettings.getState().settings.theme;
  if (pref === "system") {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

function apply() {
  useTheme.getState().setTheme(resolveEffective());
}

/**
 * Wire settings.theme + system media query into useTheme. Returns an
 * unsubscribe that removes both listeners.
 *
 * Call once during app bootstrap.
 */
export function attachThemeBridge(): () => void {
  // Initial paint.
  apply();

  // Watch user preference changes (Settings page Theme segmented).
  const unsubSettings = useSettings.subscribe((s, prev) => {
    if (s.settings.theme !== prev.settings.theme) {
      apply();
    }
  });

  // Watch OS-level color scheme changes (only matters when pref === "system",
  // but we filter inside the handler so we don't churn listeners).
  const mq =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  const onSystemChange = () => {
    if (useSettings.getState().settings.theme === "system") apply();
  };
  mq?.addEventListener("change", onSystemChange);

  return () => {
    unsubSettings();
    mq?.removeEventListener("change", onSystemChange);
  };
}
