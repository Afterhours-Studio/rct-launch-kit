import { Cpu, MemoryStick, Hash, Timer } from "lucide-react";
import { useProjects, type RunMode } from "../stores/projects";
import { useMetrics } from "../stores/metrics";
import { Segmented } from "./Segmented";
import "./side-panel.css";

interface ProcessStats {
  pid: number | null;
  pidCount: number;
  cpuPct: number | null;
  memMb: number | null;
  uptimeMs: number | null;
}

function useProcessStats(): ProcessStats {
  const projectId = useProjects((s) => s.draft.id);
  const isRunning = useProjects((s) => s.runningIds.has(s.draft.id));
  const m = useMetrics((s) => s.byProject.get(projectId) ?? null);
  if (!isRunning) {
    return { pid: null, pidCount: 0, cpuPct: null, memMb: null, uptimeMs: null };
  }
  if (!m) {
    return { pid: null, pidCount: 0, cpuPct: 0, memMb: 0, uptimeMs: 0 };
  }
  return {
    pid: m.primaryPid,
    pidCount: m.pidCount,
    cpuPct: m.cpuPct,
    memMb: m.memMb,
    uptimeMs: m.uptimeMs,
  };
}

const fmtPid = (v: number | null, count: number) => {
  if (v === null) return "—";
  if (count > 1) return `${v}+${count - 1}`;
  return String(v);
};
const fmtCpu = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const fmtMem = (v: number | null) =>
  v === null ? "—" : v >= 1024 ? `${(v / 1024).toFixed(1)}G` : `${v.toFixed(0)}M`;
const fmtUp = (ms: number | null) => {
  if (ms === null) return "—";
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
};

export function SidePanel() {
  const mode = useProjects((s) => s.draft.mode);
  const stopOnError = useProjects((s) => s.draft.stopOnError);
  const autoRestart = useProjects((s) => s.draft.autoRestart);
  const autoRun = useProjects((s) => s.draft.autoRun);
  const updateDraft = useProjects((s) => s.updateDraft);
  const isRunning = useProjects((s) => s.runningIds.has(s.draft.id));
  const stats = useProcessStats();

  function setMode(m: RunMode) {
    updateDraft({ mode: m });
  }

  return (
    <div className="side-panel">
      {/* Top 2/3 — Settings */}
      <section className="sp-section sp-section--settings">
        <header className="sp-head">
          <span className="sp-title">Settings</span>
        </header>
        <div className="sp-body">
          <div className="sp-field">
            <label className="sp-label">Run mode</label>
            <Segmented<RunMode>
              value={mode}
              onChange={setMode}
              ariaLabel="Run mode"
              block
              options={[
                { value: "sequential", label: "Sequential" },
                { value: "parallel", label: "Parallel" },
              ]}
            />
          </div>

          <Toggle
            label="Stop on error"
            hint={mode === "parallel" ? "Sequential only" : undefined}
            disabled={mode === "parallel"}
            checked={stopOnError}
            onChange={(v) => updateDraft({ stopOnError: v })}
          />
          <Toggle
            label="Auto-restart on crash"
            checked={autoRestart}
            onChange={(v) => updateDraft({ autoRestart: v })}
          />
          <Toggle
            label="Auto-run on startup"
            checked={autoRun}
            onChange={(v) => updateDraft({ autoRun: v })}
          />
        </div>
      </section>

      <div className="sp-divider" />

      {/* Bottom 1/3 — Process info */}
      <section className="sp-section sp-section--process">
        <header className="sp-head">
          <span className="sp-title">Process</span>
          <span className={`sp-dot ${isRunning ? "sp-dot--on" : ""}`} />
          <span className="sp-status">{isRunning ? "running" : "idle"}</span>
        </header>
        <div className="sp-body">
          <div className="sp-stats">
            <Stat icon={<Hash size={10} strokeWidth={2.25} />} label="PID" value={fmtPid(stats.pid, stats.pidCount)} />
            <Stat icon={<Cpu size={10} strokeWidth={2.25} />} label="CPU" value={fmtCpu(stats.cpuPct)} />
            <Stat icon={<MemoryStick size={10} strokeWidth={2.25} />} label="MEM" value={fmtMem(stats.memMb)} />
            <Stat icon={<Timer size={10} strokeWidth={2.25} />} label="UP" value={fmtUp(stats.uptimeMs)} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`sp-toggle ${disabled ? "is-disabled" : ""}`}>
      <span className="sp-toggle__text">
        <span className="sp-toggle__label">{label}</span>
        {hint && <span className="sp-toggle__hint">{hint}</span>}
      </span>
      <span className={`sp-switch ${checked ? "is-on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="sp-switch__knob" />
      </span>
    </label>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="sp-stat">
      <div className="sp-stat__label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="sp-stat__value">{value}</div>
    </div>
  );
}
