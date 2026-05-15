import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Tooltip } from "./Tooltip";
import "./forge-view.css";

interface PortEntry {
  port: number;
  addr: string;
  protocol: string;
  pid: number | null;
  processName: string | null;
  cmdLine: string | null;
  owned: boolean;
}

/**
 * Known port → service name. Hand-curated so the most common dev / infra
 * ports get an instantly recognisable label. Anything not in this map
 * still has a chance to be identified by the cmd-line/process heuristics
 * in `inferService()` below.
 */
const PORT_SERVICES: Record<number, string> = {
  // Web protocols
  80: "HTTP",
  443: "HTTPS",
  // Frontend dev servers
  1420: "Tauri dev",
  1421: "Tauri HMR",
  3000: "Node / React",
  3001: "Node alt",
  4173: "Vite preview",
  5173: "Vite",
  5174: "Vite alt",
  5500: "Live Server",
  8080: "HTTP alt",
  8888: "Jupyter",
  51420: "Dev Launch Kit",
  51421: "Dev Launch Kit HMR",
  // Backend frameworks
  4000: "GraphQL / Phoenix",
  5000: "Flask / .NET",
  8000: "Django / Python",
  8443: "HTTPS alt",
  // Databases
  3306: "MySQL",
  5432: "PostgreSQL",
  6379: "Redis",
  9200: "Elasticsearch",
  11211: "Memcached",
  27017: "MongoDB",
  // Tooling / infra
  9000: "PHP-FPM / SonarQube",
  9090: "Prometheus",
  9229: "Node debugger",
  // OS
  22: "SSH",
  53: "DNS",
};

/** Substrings in a process's command line → service label. First match wins. */
const SERVICE_CMD_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bvite\b/, "Vite"],
  [/\bnext(?:-server|\s+dev|\s+start)/, "Next.js"],
  [/\bnuxt\b/, "Nuxt"],
  [/\bastro\b/, "Astro"],
  [/\bsvelte(?:-kit|kit)\b/, "SvelteKit"],
  [/\bremix(?:\s+dev)?\b/, "Remix"],
  [/\bgatsby\b/, "Gatsby"],
  [/\bwebpack(?:-dev-server|\s+serve)\b/, "Webpack dev"],
  [/\bparcel\b/, "Parcel"],
  [/\besbuild\b/, "esbuild"],
  [/\brollup\b/, "Rollup"],
  [/\btauri\s+(?:dev|build)\b/, "Tauri"],
  [/\belectron\b/, "Electron"],
  [/\buvicorn\b/, "Uvicorn"],
  [/\bgunicorn\b/, "Gunicorn"],
  [/\bhypercorn\b/, "Hypercorn"],
  [/\bdjango\b/, "Django"],
  [/\bfastapi\b/, "FastAPI"],
  [/\bflask\b/, "Flask"],
  [/\brails\s+server\b/, "Rails"],
  [/\bpuma\b/, "Puma"],
  [/\bphoenix\b/, "Phoenix"],
  [/\bcargo\s+(?:run|watch)\b/, "Cargo"],
  [/\btarget[\\/]debug\b/, "Cargo (debug)"],
  [/\btarget[\\/]release\b/, "Cargo (release)"],
  [/\bnpm\s+run\b/, "npm script"],
  [/\byarn\s+(?:run\s+)?\w+/, "yarn script"],
  [/\bpnpm\s+(?:run\s+)?\w+/, "pnpm script"],
  [/\bnodemon\b/, "Nodemon"],
  [/\btsx\b/, "tsx"],
  [/\bts-node\b/, "ts-node"],
  [/\bbun\s+(?:run|dev)\b/, "Bun"],
  [/\bdeno\b/, "Deno"],
  [/\bhttp-server\b/, "http-server"],
  [/\blive-server\b/, "Live Server"],
  [/\bbrowser-sync\b/, "Browser-Sync"],
  [/\bngrok\b/, "ngrok"],
  [/\bjupyter\b/, "Jupyter"],
];

/** Process-name → service when cmd line is unhelpful. */
const SERVICE_NAME_FALLBACK: ReadonlyArray<readonly [RegExp, string]> = [
  [/^node(\.exe)?$/i, "Node.js"],
  [/^python\d?(\.exe)?$/i, "Python"],
  [/^ruby(\.exe)?$/i, "Ruby"],
  [/^java(\.exe)?$/i, "Java / JVM"],
  [/^go(\.exe)?$/i, "Go"],
  [/^dotnet(\.exe)?$/i, ".NET"],
  [/^php(-cgi)?(\.exe)?$/i, "PHP"],
  [/^postgres(\.exe)?$/i, "PostgreSQL"],
  [/^redis-server(\.exe)?$/i, "Redis"],
  [/^mongod(\.exe)?$/i, "MongoDB"],
  [/^docker(\.exe)?$/i, "Docker"],
];

/** Process names that are clearly dev tooling regardless of port. */
const DEV_PROCESS_HINTS = [
  "vite",
  "node",
  "esbuild",
  "webpack",
  "tsx",
  "tsc",
  "deno",
  "bun",
  "cargo",
  "rustc",
  "tauri",
  "electron",
  "uvicorn",
  "gunicorn",
  "flask",
  "rails",
  "puma",
  "nodemon",
  "watchman",
  "ngrok",
  "browser-sync",
  "http-server",
  "live-server",
];

/** Cmd-line keywords that strongly suggest a dev workflow. */
const DEV_CMD_KEYWORDS = [
  "node_modules",
  "vite",
  "webpack",
  "next dev",
  "next-server",
  "nuxt dev",
  "astro dev",
  "remix dev",
  "rails s",
  "manage.py runserver",
  "uvicorn",
  "gunicorn",
  "cargo run",
  "cargo watch",
  "tauri dev",
  "tauri build",
  "electron",
  "ts-node",
  "tsx ",
  "deno run",
  "bun run",
  "ngrok",
];

function inferService(entry: PortEntry): string | null {
  // 1. Hand-curated port → service map (fastest, most authoritative).
  const known = PORT_SERVICES[entry.port];
  if (known) return known;

  // 2. Cmd line patterns — most precise once known.
  const cmd = (entry.cmdLine ?? "").toLowerCase();
  if (cmd) {
    for (const [re, label] of SERVICE_CMD_PATTERNS) {
      if (re.test(cmd)) return label;
    }
  }

  // 3. Process-name fallback (when cmd line is empty / generic).
  const name = entry.processName ?? "";
  for (const [re, label] of SERVICE_NAME_FALLBACK) {
    if (re.test(name)) return label;
  }

  return null;
}

function isLikelyDev(entry: PortEntry): boolean {
  // Spawned by this app — always include.
  if (entry.owned) return true;
  // In the curated port map.
  if (PORT_SERVICES[entry.port] !== undefined) return true;
  // Cmd line or process name screams "dev tooling".
  const cmd = (entry.cmdLine ?? "").toLowerCase();
  if (DEV_CMD_KEYWORDS.some((k) => cmd.includes(k))) return true;
  const name = (entry.processName ?? "").toLowerCase();
  if (DEV_PROCESS_HINTS.some((h) => name.includes(h))) return true;
  // High port + loopback only — strong signal of a local dev server
  // (servers exposed to the network usually bind 0.0.0.0).
  if (
    entry.port >= 3000 &&
    entry.port < 65535 &&
    (entry.addr === "127.0.0.1" || entry.addr === "::1")
  ) {
    return true;
  }
  return false;
}

const REFRESH_MS = 4000;

export function ForgeView() {
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyCommon, setOnlyCommon] = useState(true);
  const [killing, setKilling] = useState<number | null>(null);
  const firstLoad = useRef(true);

  /**
   * Pull the port list from the backend.
   *
   * `silent: true`  → no spinner (used by the background auto-refresh).
   * `silent: false` → spinner visible for at least MIN_SPIN_MS so a manual
   * click always reads as "something happened", even when the invoke
   * returns instantly.
   */
  async function refresh(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    const MIN_SPIN_MS = 500;
    if (!silent) setLoading(true);
    const started = performance.now();
    try {
      const r = await invoke<PortEntry[]>("list_listening_ports");
      setPorts(r);
    } catch (e) {
      toast.error(`Could not enumerate ports: ${String(e)}`);
    } finally {
      if (!silent) {
        const elapsed = performance.now() - started;
        if (elapsed < MIN_SPIN_MS) {
          await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
        }
        setLoading(false);
      }
      firstLoad.current = false;
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => refresh({ silent: true }), REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function killPort(pid: number, port: number, name: string | null) {
    const label = name ? `${name} (PID ${pid})` : `PID ${pid}`;
    const ok = window.confirm(
      `Terminate ${label} holding port ${port}?\n\nThis force-kills the whole process tree.`,
    );
    if (!ok) return;
    setKilling(pid);
    try {
      await invoke("kill_port_process", { pid });
      toast.success(`Killed ${label}`);
      await new Promise((r) => setTimeout(r, 250));
      await refresh();
    } catch (e) {
      toast.error(`Kill failed: ${String(e)}`);
    } finally {
      setKilling(null);
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return ports.filter((p) => {
      if (onlyCommon && !isLikelyDev(p)) return false;
      if (!q) return true;
      const service = inferService(p) ?? "";
      return (
        String(p.port).includes(q) ||
        (p.processName ?? "").toLowerCase().includes(q) ||
        service.toLowerCase().includes(q) ||
        String(p.pid ?? "").includes(q) ||
        p.addr.includes(q)
      );
    });
  }, [ports, filter, onlyCommon]);

  // De-dup IPv4 + IPv6 entries for the same (port, pid).
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return filtered.filter((p) => {
      const key = `${p.port}-${p.pid ?? "?"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filtered]);

  const ownedCount = ports.filter((p) => p.owned).length;

  return (
    <div className="forge-view">
      <header className="forge-view__head">
        <h1 className="forge-view__title">Port Explorer</h1>
        <p className="forge-view__subtitle">
          Inspect every TCP listener on this machine and terminate zombie
          dev servers in one click.
        </p>
      </header>

      {/* Filter card — title sits INSIDE the card head, mirroring the
       * SETTINGS / PROCESS sections on the Stack tab's side panel. */}
      <section className="forge-card">
        <header className="forge-card__head">
          <span className="forge-card__title">Filter</span>
        </header>
        <div className="forge-card__body">
          <Row
            label="Search"
            hint="Match port number, process name, PID, or address."
          >
            <div className="forge-search">
              <Search size={13} strokeWidth={1.75} />
              <input
                type="text"
                className="forge-search__input"
                placeholder="e.g. 1420, vite, 28104…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                spellCheck={false}
              />
            </div>
          </Row>
          <Row
            label="Common port only"
            hint="Hide system services. Detected by port, process name, and command line."
          >
            <Toggle checked={onlyCommon} onChange={setOnlyCommon} />
          </Row>
        </div>
      </section>

      {/* Listening ports panel mirrors LogView on the Stack tab:
       *   outer card (cream-panel bg)
       *     head bar (title + refresh)  ← sits on outer bg
       *     body (padding wrapper)
       *       inner scroll well (canvas bg + well-inset)  ← list scrolls here
       */}
      <section className="forge-listing">
        <header className="forge-listing__head">
          <span className="forge-listing__title">Listening ports</span>
          <span className="forge-listing__count">
            {deduped.length} of {ports.length}
            {ownedCount > 0 && ` · ${ownedCount} ours`}
          </span>
          <Tooltip label="Refresh">
            <button
              type="button"
              className="forge-listing__action"
              onClick={() => refresh()}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw
                size={12}
                strokeWidth={1.75}
                className={loading ? "spin" : ""}
              />
            </button>
          </Tooltip>
        </header>
        <div className="forge-listing__body">
          <div className="forge-listing__scroll">
            {deduped.length === 0 ? (
              <div className="forge-empty">
                {loading ? "Scanning…" : "Nothing matches."}
              </div>
            ) : (
              deduped.map((p) => (
                <PortRow
                  key={`${p.port}-${p.pid ?? 0}-${p.addr}`}
                  entry={p}
                  service={inferService(p)}
                  killing={killing === p.pid}
                  onKill={() =>
                    p.pid && killPort(p.pid, p.port, p.processName)
                  }
                />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------- Building blocks ----------

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
    <div className="forge-row">
      <div className="forge-row__text">
        <span className="forge-row__label">{label}</span>
        {hint && <span className="forge-row__hint">{hint}</span>}
      </div>
      <div className="forge-row__control">{children}</div>
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
    <label className="forge-switch-wrap">
      <span className={`forge-switch ${checked ? "is-on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="forge-switch__knob" />
      </span>
    </label>
  );
}

function PortRow({
  entry,
  service,
  killing,
  onKill,
}: {
  entry: PortEntry;
  service: string | null;
  killing: boolean;
  onKill: () => void;
}) {
  // Loopback IPs are common — collapse the verbose form for readability.
  const addrLabel =
    entry.addr === "0.0.0.0" || entry.addr === "::"
      ? "all"
      : entry.addr === "127.0.0.1" || entry.addr === "::1"
        ? "localhost"
        : entry.addr;

  return (
    <div className={`port-row ${entry.owned ? "port-row--owned" : ""}`}>
      <span className="port-row__number">{entry.port}</span>

      <div className="port-row__info">
        <div className="port-row__top">
          <span className="port-row__service">
            {service ?? entry.processName ?? "Unknown service"}
          </span>
          {entry.owned && (
            <span className="port-row__badge port-row__badge--owned">
              spawned by app
            </span>
          )}
        </div>
        <div className="port-row__meta">
          <span className="port-row__meta-name">
            {entry.processName ?? "unknown.exe"}
          </span>
          <span className="port-row__meta-dot" />
          <span className="port-row__meta-pid">
            PID {entry.pid ?? "—"}
          </span>
          <span className="port-row__meta-dot" />
          <span className="port-row__meta-addr">{addrLabel}</span>
        </div>
      </div>

      {entry.pid != null && (
        <Tooltip
          label={`Terminate ${entry.processName ?? "process"} (tree)`}
        >
          <button
            type="button"
            className="port-row__kill"
            onClick={onKill}
            disabled={killing}
            aria-label="Kill process"
          >
            {killing ? (
              <RefreshCw size={12} strokeWidth={1.75} className="spin" />
            ) : (
              <X size={13} strokeWidth={2} />
            )}
          </button>
        </Tooltip>
      )}
    </div>
  );
}
