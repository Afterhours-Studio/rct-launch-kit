# Dev Launch Kit

A small desktop launcher for the dev stacks you reach for every day.

You wire up your projects once — backend, frontend, workers, scripts — and
then start the whole thing with one click. Each project can run multiple
parallel "lanes" (think: API + web + worker), each lane runs its commands
sequentially or in parallel, with delays between steps. Live logs, process
metrics, auto-restart, and a Cmd+K command palette come built in.

Built with **Tauri 2 + React 19 + TypeScript**. Native windowed app on
Windows, macOS, and Linux.

> Crafted by [h1dr0n](https://github.com/h1dr0nn).

---

## Highlights

- **Multiple projects, persisted to disk.** Projects live in
  `app_data_dir/projects.json`. Add, edit, rename inline, delete from the
  sidebar context menu.
- **Up to 3 parallel lanes per project.** Each lane has its own working
  directory and command list. Useful when "Run" really means starting a
  database, an API, and a frontend in three terminals.
- **Sequential or parallel commands within a lane.** Sequential mode honors
  per-step delays (in ms) and an optional "stop on error" flag. Parallel
  mode fires everything at once.
- **Auto-restart on crash.** When a long-running command (like a dev
  server) exits non-zero, restart it automatically with a 1s backoff.
- **Auto-run on startup.** Flag a project to launch the moment the app
  opens. Great for "always-on" stacks.
- **Live logs with ANSI color.** Each line is tagged with its lane and step
  index. Auto-scroll, pause, clear, copy. Stderr and system messages are
  visually distinct.
- **Live process metrics.** PID, aggregate CPU, memory, and uptime for the
  full process tree (children of the spawned shell included), refreshed
  every second.
- **Cmd+K command palette.** Search projects, run/stop any project,
  navigate views, switch theme, control the window — all from the keyboard.
- **Light / Dark / System theme.** Settings page persists your choice; the
  System option follows OS color preference and reacts in real time.
- **Drag-reorder commands.** Reorder steps with the grab handle.
- **Smart kill.** `Stop` walks the process tree (`taskkill /T /F` on
  Windows, `kill -- -PGID` on Unix) so npm-spawned servers actually die.

---

## Install & run

Prerequisites:

- **Node.js** 20+ and **npm**
- **Rust** stable toolchain
- Windows / macOS / Linux build tools for Tauri 2 — see
  [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

Then:

```bash
npm install
npm run tauri dev      # development with hot-reload
npm run tauri build    # production bundle (MSI/NSIS/.dmg/.AppImage)
```

The dev server runs on `http://localhost:1420` and the Tauri window opens
automatically.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Open command palette |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + S` | Save current project |
| `Ctrl/Cmd + Enter` | Run / Stop the current project |
| `F2` | Rename project (when one is selected) |
| `Esc` | Close palette / context menu |

---

## Architecture

### Backend (`src-tauri/`)

| Module | Role |
|---|---|
| `runner.rs` | Spawns child processes via `tokio::process::Command`, streams stdout/stderr line-by-line, emits typed events (`proc://line`, `proc://step`, `proc://lane`, `proc://project`, `proc://metrics`). Handles per-lane sequential/parallel execution, auto-restart loop, and process-tree kill. |
| `projects.rs` | `Project / Lane / Command` types mirrored to the frontend, plus JSON persistence to `app_data_dir/projects.json`. |
| `settings.rs` | App-level settings (theme, log buffer cap, default shell, kill timeout, confirmations, auto-update check). Tauri-managed `RwLock` so the runner reads settings without round-tripping to disk. |
| `commands.rs` | Tauri command handlers: `list_projects`, `save_projects`, `start_project`, `stop_project`, `list_running`, `get_settings`, `save_settings`, `reset_settings`, `check_update`. |

Cross-platform notes:

- **Windows**: spawn via `cmd /C` or `powershell` (configurable in
  Settings), kill via `taskkill /F /T /PID` to take down the whole tree.
- **Unix**: spawn via `sh -c` with `process_group(0)` so the child
  becomes its own PGID, kill via `kill -- -PGID` for a clean tree teardown
  (with a configurable SIGTERM→SIGKILL grace period).
- All children get `kill_on_drop(true)` plus `PYTHONIOENCODING=utf-8`,
  `PYTHONUTF8=1`, `PYTHONUNBUFFERED=1`, `LANG=C.UTF-8`, `FORCE_COLOR=1`
  injected into their environment, so Python servers and Node tooling
  behave the same as in a real terminal.

### Frontend (`src/`)

State is kept in a handful of small Zustand stores — no Redux, no global
context layer.

| Store | What it holds |
|---|---|
| `useProjects` | Saved projects, current draft, dirty flag, set of currently running ids. |
| `useSettings` | Mirror of the persisted settings file. |
| `useLogs` | Per-project ring buffer of log lines (cap from settings, default 2000). |
| `useRuns` | Per-project step / lane / project state machine. |
| `useMetrics` | Latest metrics snapshot per running project. |
| `useTheme` | The *effective* light/dark value applied to the DOM. |
| `useView` | Which top-level view is rendered (`stack` / `forge` / `settings`). |
| `useSidebar` | Sidebar width + collapsed flag (persisted to localStorage). |

`src/lib/backend.ts` is the single bridge to Tauri: it wraps every
`invoke` call, sets up the four event listeners, and persists project
changes back to disk on every save.

`src/lib/theme-bridge.ts` resolves the user preference (`light`/`dark`/
`system`) into the effective theme by watching `prefers-color-scheme` and
the settings store.

`src/lib/ansi.ts` is a tiny SGR parser (no dependency) that turns a raw
log line into styled spans for the log view.

### Layout

The UI is a fixed-position three-zone layout: a 32 px custom title bar
(no native decoration — the window draws its own controls and uses the
Acrylic blur effect on Windows), a resizable sidebar (224–480 px,
collapsible with `Ctrl+B`), and a content panel that switches between
`ProjectView`, `SettingsView`, and a Forge placeholder.

Visual language follows `DESIGN.md`: warm cream canvas, coral primary
(`#cc785c`), Copernicus / Tiempos serif for display, Inter / Söhne
humanist sans for body, JetBrains Mono for code and paths.

---

## Storage layout

Everything lives in the OS-standard app data directory:

- **Windows**: `%APPDATA%\com.h1dr0n.rct-launch-kit\`
- **macOS**: `~/Library/Application Support/com.h1dr0n.rct-launch-kit/`
- **Linux**: `~/.local/share/com.h1dr0n.rct-launch-kit/`

Two files:

- `projects.json` — your saved projects
- `settings.json` — app settings

Both are plain JSON; safe to back up, sync, or hand-edit when the app is
closed.

---

## Roadmap / known gaps

- ANSI 256-color and truecolor (`38;5;n`, `38;2;r;g;b`) are stripped, not
  rendered — the parser handles standard 16-color SGR only.
- The "Forge" tab is a placeholder for command templates / snippets.
- No global hotkey to summon the window from anywhere — all shortcuts
  require focus.
- Process metrics use `sysinfo` and may report 0% CPU on the very first
  sample after a project starts.

---

## License

MIT — see [LICENSE](./LICENSE).
