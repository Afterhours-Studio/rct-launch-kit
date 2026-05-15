import { useEffect, useState } from "react";
import {
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  Loader2,
  CheckCircle2,
  ArrowUpCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Segmented } from "./Segmented";
import { api, type UpdateInfo } from "../lib/backend";
import {
  useSettings,
  type Settings,
  type Theme,
  type WindowsShell,
  DEFAULT_SETTINGS,
} from "../stores/settings";
import "./settings-view.css";

const IS_WINDOWS =
  typeof navigator !== "undefined" &&
  /win/i.test(navigator.platform || navigator.userAgent || "");

const REPO_URL = "https://github.com/h1dr0nn";

export function SettingsView() {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const replace = useSettings((s) => s.replace);

  const [resetting, setResetting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<UpdateInfo | null>(null);

  /**
   * Persist any patch through the backend so disk + managed Rust state stay in
   * sync. UI updates locally first for responsiveness; on error we revert.
   */
  async function update(p: Partial<Settings>) {
    const prev = settings;
    const next = { ...prev, ...p };
    patch(p);
    try {
      await api.saveSettings(next);
    } catch (e) {
      replace(prev);
      toast.error(`Save failed: ${String(e)}`);
    }
  }

  async function onReset() {
    if (resetting) return;
    setResetting(true);
    try {
      const fresh = await api.resetSettings();
      replace(fresh);
      toast.success("Settings reset to defaults");
    } catch (e) {
      toast.error(`Reset failed: ${String(e)}`);
    } finally {
      setResetting(false);
    }
  }

  async function onCheckUpdate() {
    if (checking) return;
    setChecking(true);
    try {
      const info = await api.checkUpdate();
      setLastUpdate(info);
      if (info.hasUpdate && info.latest) {
        toast.success(`Update available: v${info.latest}`);
      } else if (info.notes) {
        toast.message(info.notes);
      } else {
        toast.success(`You're up to date (v${info.current})`);
      }
    } catch (e) {
      toast.error(`Check failed: ${String(e)}`);
    } finally {
      setChecking(false);
    }
  }

  // Auto-check on first mount when enabled.
  useEffect(() => {
    if (settings.autoCheckUpdates && !lastUpdate) {
      onCheckUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="settings-view">
      <div className="settings-view__scroll">
        <header className="settings-view__head">
          <h1 className="settings-view__title">Settings</h1>
          <p className="settings-view__subtitle">
            Preferences are saved automatically and apply across the app.
          </p>
        </header>

        <Section title="Appearance" hint="Visual tweaks for the workspace.">
          <Row label="Theme" hint="Follow OS, or pin a tone.">
            <Segmented<Theme>
              value={settings.theme}
              onChange={(v) => update({ theme: v })}
              ariaLabel="Theme"
              options={[
                { value: "light", label: "Light", icon: <Sun size={12} /> },
                { value: "dark", label: "Dark", icon: <Moon size={12} /> },
                { value: "system", label: "System", icon: <Monitor size={12} /> },
              ]}
            />
          </Row>
        </Section>

        <Section title="Logs" hint="Output rendering and history.">
          <Row label="Max log lines" hint="Per-project ring buffer cap.">
            <NumberInput
              value={settings.maxLogLines}
              min={100}
              max={10000}
              step={100}
              onChange={(v) => update({ maxLogLines: v })}
            />
          </Row>
          <Row label="Auto-scroll by default" hint="Follow tail on new lines.">
            <Toggle
              checked={settings.autoScroll}
              onChange={(v) => update({ autoScroll: v })}
            />
          </Row>
          <Row label="Show timestamps">
            <Toggle
              checked={settings.showTimestamps}
              onChange={(v) => update({ showTimestamps: v })}
            />
          </Row>
        </Section>

        <Section
          title="Behavior"
          hint="Confirmation prompts and safety checks."
        >
          <Row label="Confirm before deleting a project">
            <Toggle
              checked={settings.confirmDelete}
              onChange={(v) => update({ confirmDelete: v })}
            />
          </Row>
          <Row label="Confirm before stopping a running project">
            <Toggle
              checked={settings.confirmStop}
              onChange={(v) => update({ confirmStop: v })}
            />
          </Row>
        </Section>

        <Section
          title="Process"
          hint="How commands are executed under the hood."
        >
          {IS_WINDOWS && (
            <Row
              label="Default shell (Windows)"
              hint="Used to invoke each command."
            >
              <Segmented<WindowsShell>
                value={settings.windowsShell}
                onChange={(v) => update({ windowsShell: v })}
                ariaLabel="Default shell"
                options={[
                  { value: "cmd", label: "cmd" },
                  { value: "powershell", label: "PowerShell" },
                ]}
              />
            </Row>
          )}
          <Row
            label="Kill timeout (ms)"
            hint="Grace period between SIGTERM and SIGKILL on Unix."
          >
            <NumberInput
              value={settings.killTimeoutMs}
              min={0}
              max={10000}
              step={100}
              onChange={(v) => update({ killTimeoutMs: v })}
            />
          </Row>
        </Section>

        <Section title="Updates" hint="Stay current with the latest release.">
          <Row label="Auto-check on startup">
            <Toggle
              checked={settings.autoCheckUpdates}
              onChange={(v) => update({ autoCheckUpdates: v })}
            />
          </Row>
          {lastUpdate && (
            <UpdateBanner
              info={lastUpdate}
              onOpen={() =>
                lastUpdate.releaseUrl && openUrl(lastUpdate.releaseUrl)
              }
            />
          )}
        </Section>

        {/* ---- Footer: credit + reset + check update ---- */}
        <footer className="settings-footer">
          <div className="settings-footer__credit">
            <div className="settings-footer__brand">
              <img
                src="/icon.png"
                alt=""
                className="settings-footer__icon"
                aria-hidden
              />
              <span className="settings-footer__name">Dev Launch Kit</span>
            </div>
            <div className="settings-footer__author">
              Crafted by{" "}
              <button
                type="button"
                className="settings-footer__link"
                onClick={() => openUrl(REPO_URL)}
              >
                <span>h1dr0n</span>
                <ExternalLink size={10} strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div className="settings-footer__actions">
            <button
              type="button"
              className="settings-btn"
              onClick={onReset}
              disabled={resetting || isDefault(settings)}
              title={
                isDefault(settings)
                  ? "Already at defaults"
                  : "Restore all settings to factory defaults"
              }
            >
              {resetting ? (
                <Loader2 size={13} strokeWidth={1.75} className="spin" />
              ) : (
                <RotateCcw size={13} strokeWidth={1.75} />
              )}
              <span>Reset defaults</span>
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={onCheckUpdate}
              disabled={checking}
            >
              {checking ? (
                <Loader2 size={13} strokeWidth={1.75} className="spin" />
              ) : (
                <RefreshCw size={13} strokeWidth={1.75} />
              )}
              <span>Check for updates</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function isDefault(s: Settings): boolean {
  return (
    s.theme === DEFAULT_SETTINGS.theme &&
    s.maxLogLines === DEFAULT_SETTINGS.maxLogLines &&
    s.autoScroll === DEFAULT_SETTINGS.autoScroll &&
    s.showTimestamps === DEFAULT_SETTINGS.showTimestamps &&
    s.confirmDelete === DEFAULT_SETTINGS.confirmDelete &&
    s.confirmStop === DEFAULT_SETTINGS.confirmStop &&
    s.windowsShell === DEFAULT_SETTINGS.windowsShell &&
    s.killTimeoutMs === DEFAULT_SETTINGS.killTimeoutMs &&
    s.autoCheckUpdates === DEFAULT_SETTINGS.autoCheckUpdates
  );
}

// ---------- Building blocks ----------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <header className="settings-section__head">
        <h2 className="settings-section__title">{title}</h2>
        {hint && <p className="settings-section__hint">{hint}</p>}
      </header>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        {hint && <span className="settings-row__hint">{hint}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="settings-switch-wrap">
      <span className={`settings-switch ${checked ? "is-on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settings-switch__knob" />
      </span>
    </label>
  );
}

function NumberInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      className="settings-number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        onChange(Math.max(min, Math.min(max, Math.round(n))));
      }}
    />
  );
}

function UpdateBanner({
  info,
  onOpen,
}: {
  info: UpdateInfo;
  onOpen: () => void;
}) {
  const cls = info.hasUpdate
    ? "settings-update settings-update--available"
    : info.source === "local" || info.notes
      ? "settings-update settings-update--warn"
      : "settings-update settings-update--ok";
  const Icon = info.hasUpdate
    ? ArrowUpCircle
    : info.notes && info.source === "local"
      ? AlertCircle
      : CheckCircle2;
  return (
    <div className={cls}>
      <Icon size={14} strokeWidth={1.75} />
      <div className="settings-update__text">
        {info.hasUpdate && info.latest ? (
          <>
            <strong>v{info.latest}</strong> is available — you have v
            {info.current}.
          </>
        ) : info.notes ? (
          <>{info.notes}</>
        ) : (
          <>You are running the latest version (v{info.current}).</>
        )}
      </div>
      {info.releaseUrl && (
        <button
          type="button"
          className="settings-update__action"
          onClick={onOpen}
        >
          View release
        </button>
      )}
    </div>
  );
}
