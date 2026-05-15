import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { useLogs } from "../stores/logs";
import { useProjects } from "../stores/projects";
import { useSettings } from "../stores/settings";
import { parseAnsi, spanStyle } from "../lib/ansi";
import "./log-view.css";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function LogView() {
  const projectId = useProjects((s) => s.draft.id);
  const lanes = useProjects((s) => s.draft.lanes);
  const lines = useLogs((s) => s.byProject.get(projectId) ?? EMPTY);
  const clearLogs = useLogs((s) => s.clear);
  const defaultAutoscroll = useSettings((s) => s.settings.autoScroll);
  const showTimestamps = useSettings((s) => s.settings.showTimestamps);

  const [autoscroll, setAutoscroll] = useState(defaultAutoscroll);
  const scrollRef = useRef<HTMLDivElement>(null);

  // When the user changes the default in Settings, reflect it for the current
  // session (won't override an active manual pause though).
  useEffect(() => {
    setAutoscroll(defaultAutoscroll);
  }, [defaultAutoscroll]);

  useEffect(() => {
    if (!autoscroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, autoscroll]);

  /** Stable lane index for short prefix. */
  const laneIdx = (laneId: string): number => {
    const i = lanes.findIndex((l) => l.id === laneId);
    return i < 0 ? 0 : i + 1;
  };

  return (
    <div className="log-view">
      <div className="log-view__head">
        <span className="log-view__title">Logs</span>
        <span className="log-view__count">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </span>
        <div className="log-view__actions">
          <button
            className="log-view__btn"
            type="button"
            onClick={() => setAutoscroll((v) => !v)}
            title={autoscroll ? "Pause auto-scroll" : "Resume auto-scroll"}
          >
            {autoscroll ? (
              <Pause size={12} strokeWidth={1.75} />
            ) : (
              <Play size={12} strokeWidth={1.75} />
            )}
          </button>
          <button
            className="log-view__btn"
            type="button"
            onClick={() => clearLogs(projectId)}
            title="Clear"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="log-view__body">
        <div ref={scrollRef} className="log-view__scroll">
          {lines.length === 0 ? (
            <div className="log-view__empty">
              No output yet. Press Run to start.
            </div>
          ) : (
            lines.map((l) => (
              <LogRow
                key={l.id}
                line={l}
                laneIdx={laneIdx(l.laneId)}
                showTimestamp={showTimestamps}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY: never[] = [];

interface LogRowProps {
  line: {
    id: number;
    laneId: string;
    stepIdx: number;
    stream: "stdout" | "stderr" | "system";
    text: string;
    ts: number;
  };
  laneIdx: number;
  showTimestamp: boolean;
}

function LogRow({ line, laneIdx, showTimestamp }: LogRowProps) {
  const spans = useMemo(() => parseAnsi(line.text), [line.text]);
  return (
    <div className={`log-line log-line--${line.stream}`}>
      {showTimestamp && (
        <span className="log-line__ts">{fmtTime(line.ts)}</span>
      )}
      <span className="log-line__src">
        L{laneIdx}·{line.stepIdx + 1}
      </span>
      <span className="log-line__text">
        {spans.map((s, i) => (
          <span key={i} style={spanStyle(s)}>
            {s.text}
          </span>
        ))}
      </span>
    </div>
  );
}
