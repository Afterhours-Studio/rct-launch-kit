import { useEffect, useState } from "react";
import { X, LogOut, Minimize2 } from "lucide-react";
import { api } from "../lib/backend";
import { useSettings } from "../stores/settings";
import "./close-confirm-modal.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Asks the user what to do when they click the window × button.
 *
 * Two outcomes:
 * - Run in background → hide the window; tray icon keeps the app alive.
 * - Quit → exit the process.
 *
 * When "Remember this choice" is ticked we persist the picked outcome to
 * `closeBehavior`, so future closes skip the modal entirely.
 */
export function CloseConfirmModal({ open, onClose }: Props) {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (open) setRemember(false);
  }, [open]);

  if (!open) return null;

  async function pick(choice: "hide" | "quit") {
    if (remember) {
      const next = { ...settings, closeBehavior: choice };
      patch({ closeBehavior: choice });
      // Persist so next launch (and the Rust close-handler) honors it.
      try {
        await api.saveSettings(next);
      } catch {
        // Non-fatal — the choice still applies for this close.
      }
    }
    onClose();
    if (choice === "quit") {
      await api.quitApp();
    } else {
      await api.hideToTray();
    }
  }

  return (
    <div
      className="close-modal__overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="close-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-modal-title"
      >
        <button
          type="button"
          className="close-modal__dismiss"
          aria-label="Cancel"
          onClick={onClose}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
        <h2 id="close-modal-title" className="close-modal__title">
          Close Dev Launch Kit?
        </h2>
        <p className="close-modal__body">
          Running projects will keep their child processes alive while the app
          runs in the background.
        </p>
        <div className="close-modal__actions">
          <button
            type="button"
            className="close-modal__btn close-modal__btn--primary"
            onClick={() => pick("hide")}
          >
            <Minimize2 size={13} strokeWidth={1.75} />
            <span>Run in background</span>
          </button>
          <button
            type="button"
            className="close-modal__btn"
            onClick={() => pick("quit")}
          >
            <LogOut size={13} strokeWidth={1.75} />
            <span>Quit</span>
          </button>
        </div>
        <label className="close-modal__remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Remember this choice</span>
        </label>
      </div>
    </div>
  );
}
