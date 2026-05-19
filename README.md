# Dev Launch Kit

A small desktop launcher for the dev stacks you reach for every day.

You wire up your projects once — backend, frontend, workers, scripts — and
then start the whole thing with one click. Each project can run multiple
parallel "lanes" (think: API + web + worker), each lane runs its commands
sequentially or in parallel, with delays between steps. Live logs, process
metrics, port explorer, auto-restart, and a `Cmd+K` command palette come
built in.

Native Windows, macOS, and Linux app. No browser tab, no terminal soup.

> Crafted by [h1dr0n](https://github.com/h1dr0n).

---

## Download

Grab the latest installer from the
**[Releases](https://github.com/Afterhours-Studio/rct-launch-kit/releases)** page.

| OS | File |
|---|---|
| **Windows 10/11** | `dev-launch-kit-<version>-windows-x64-setup.exe` (NSIS installer) |
| | `dev-launch-kit-<version>-windows-x64.msi` (MSI for managed deployments) |
| | `dev-launch-kit-<version>-windows-x64-portable.zip` (no install, just unzip & run) |
| **macOS Apple Silicon** | `dev-launch-kit-<version>-macos-arm64.dmg` |
| **macOS Intel** | `dev-launch-kit-<version>-macos-x64.dmg` |
| **Linux** | `dev-launch-kit-<version>-linux-x64.AppImage` (universal, `chmod +x` then run) |
| | `dev-launch-kit-<version>-linux-x64.deb` (Debian / Ubuntu / Mint) |

> The first launch on macOS may complain about an unidentified developer.
> Right-click the `.app` → **Open** → confirm once and macOS remembers it.

---

## What it does

- **Multiple projects, persisted to disk.** Add, rename inline, delete from
  the sidebar context menu. Everything lives in
  `app_data_dir/projects.json` so you can sync or hand-edit it.
- **Up to 3 parallel lanes per project.** Each lane has its own working
  directory and command list. Useful when "Run" really means starting a
  database, an API, and a frontend in three terminals.
- **Sequential or parallel execution.** Sequential mode honors per-step
  delays (in ms) and an optional *stop on error* flag. Parallel fires
  everything at once.
- **Auto-restart on crash.** When a long-running command (e.g. a dev
  server) exits non-zero, restart it automatically with a 1 s backoff.
- **Auto-run on startup.** Flag a project to launch the moment the app
  opens. Great for "always-on" stacks.
- **Live logs with ANSI color.** Each line is tagged with its lane and
  step index. Auto-scroll, pause, clear, copy. Stderr and system messages
  are visually distinct.
- **Live process metrics.** PID, aggregate CPU, memory, uptime for the
  full process tree (children of the spawned shell included), refreshed
  every second.
- **Port Explorer.** Find what's holding `1420`, `3000`, `5173`, etc. and
  kill it in one click. Smart detection by port number, process name, and
  command line.
- **Cmd+K command palette.** Search projects, run/stop, navigate views,
  switch theme, control the window — all from the keyboard.
- **Light · Dark · System theme.** Settings persists your choice; the
  *System* option follows the OS color preference and reacts in real time.
- **Drag-reorder commands.** Move steps around with the grab handle.
- **Smart kill.** Stop walks the process tree (`taskkill /T /F` on
  Windows, `kill -- -PGID` on Unix) so npm-spawned servers actually die.

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

## Where your data lives

OS-standard app data directory:

- **Windows** — `%APPDATA%\com.h1dr0n.rct-launch-kit\`
- **macOS** — `~/Library/Application Support/com.h1dr0n.rct-launch-kit/`
- **Linux** — `~/.local/share/com.h1dr0n.rct-launch-kit/`

Two files:

- `projects.json` — your saved projects
- `settings.json` — app settings

Both are plain JSON. Safe to back up, sync between machines, or hand-edit
when the app is closed.

---

## License

MIT — see [LICENSE](./LICENSE).
