use crate::projects::{Lane, Project, RunMode};
use crate::settings::{SettingsState, WindowsShell};
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, Notify};
use tokio::task::JoinHandle;

// ---------- Events ----------

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
    System,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StepState {
    Running,
    Done,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LaneState {
    Running,
    Done,
    Failed,
    Stopped,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectState {
    Running,
    Done,
    Failed,
    Stopped,
}

#[derive(Serialize, Clone)]
pub struct LineEvent {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "laneId")]
    pub lane_id: String,
    #[serde(rename = "stepIdx")]
    pub step_idx: usize,
    pub stream: LogStream,
    pub text: String,
    pub ts: u64,
}

#[derive(Serialize, Clone)]
pub struct StepEvent {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "laneId")]
    pub lane_id: String,
    #[serde(rename = "stepIdx")]
    pub step_idx: usize,
    pub state: StepState,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: u64,
}

#[derive(Serialize, Clone)]
pub struct LaneEvent {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "laneId")]
    pub lane_id: String,
    pub state: LaneState,
    pub pid: Option<u32>,
}

#[derive(Serialize, Clone)]
pub struct ProjectEvent {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub state: ProjectState,
}

#[derive(Serialize, Clone)]
pub struct MetricsEvent {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "primaryPid")]
    pub primary_pid: Option<u32>,
    #[serde(rename = "pidCount")]
    pub pid_count: u32,
    #[serde(rename = "cpuPct")]
    pub cpu_pct: f32,
    #[serde(rename = "memMb")]
    pub mem_mb: u64,
    #[serde(rename = "uptimeMs")]
    pub uptime_ms: u64,
}

// ---------- Runner state ----------

pub struct RunHandle {
    pub tasks: Vec<JoinHandle<()>>,
    pub metrics_task: Option<JoinHandle<()>>,
    /// Active child PIDs keyed by `laneId:stepIdx`. Used to kill on stop.
    pub active_pids: Arc<Mutex<HashMap<String, u32>>>,
    pub stop_flag: Arc<Notify>,
    pub stopped: Arc<AtomicBool>,
    pub any_failed: Arc<AtomicBool>,
    pub done_notify: Arc<Notify>,
}

#[derive(Default)]
pub struct Runner {
    pub runs: Mutex<HashMap<String, RunHandle>>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn emit_system(app: &AppHandle, project_id: &str, lane_id: &str, step_idx: usize, text: String) {
    let _ = app.emit(
        "proc://line",
        LineEvent {
            project_id: project_id.to_string(),
            lane_id: lane_id.to_string(),
            step_idx,
            stream: LogStream::System,
            text,
            ts: now_ms(),
        },
    );
}

fn make_command(cmd: &str, cwd: &str, win_shell: WindowsShell) -> Command {
    let mut c = if cfg!(windows) {
        match win_shell {
            WindowsShell::Powershell => {
                let mut c = Command::new("powershell");
                c.args(["-NoLogo", "-NoProfile", "-Command", cmd]);
                c
            }
            WindowsShell::Cmd => {
                let mut c = Command::new("cmd");
                c.args(["/C", cmd]);
                c
            }
        }
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", cmd]);
        c
    };
    if !cwd.is_empty() {
        c.current_dir(cwd);
    }
    c.stdout(Stdio::piped());
    c.stderr(Stdio::piped());
    c.stdin(Stdio::null());
    // Make sure orphaned children get cleaned up if the app process dies
    // unexpectedly. kill_tree() is still used for the normal Stop path.
    c.kill_on_drop(true);

    // Force UTF-8 stdout/stderr for piped children. Without a real TTY many
    // runtimes fall back to ANSI/locale codepages (cp1252 on Windows) and
    // crash on non-ASCII output (e.g. Python `rich` printing emoji).
    c.env("PYTHONIOENCODING", "utf-8");
    c.env("PYTHONUTF8", "1");
    c.env("PYTHONUNBUFFERED", "1");
    // Coerce libc-based locale-aware programs (Click, Rich on POSIX) to UTF-8.
    c.env("LANG", "C.UTF-8");
    c.env("LC_ALL", "C.UTF-8");
    // Hint Node.js / npm to keep colored output even when stdout is a pipe.
    c.env("FORCE_COLOR", "1");

    #[cfg(unix)]
    {
        // New process group → kill -- -PID kills the whole tree.
        c.process_group(0);
    }
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: suppress the flash of a console window when we
        // spawn a child via cmd.exe / powershell.exe. The app itself runs
        // under windows_subsystem="windows" so it has no console to inherit,
        // and without this flag Windows allocates a fresh one per child.
        c.creation_flags(0x0800_0000);
    }
    c
}

fn kill_tree(pid: u32, kill_timeout_ms: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = kill_timeout_ms; // unused on Windows
    }
    #[cfg(unix)]
    {
        let neg = format!("-{}", pid);
        let _ = std::process::Command::new("kill")
            .args(["--", &neg])
            .status();
        std::thread::sleep(std::time::Duration::from_millis(kill_timeout_ms as u64));
        let _ = std::process::Command::new("kill")
            .args(["-9", "--", &neg])
            .status();
    }
}

// ---------- Public API ----------

pub async fn start(app: AppHandle, project: Project) -> anyhow::Result<()> {
    let runner = app.state::<Runner>();
    {
        let runs = runner.runs.lock().await;
        if runs.contains_key(&project.id) {
            anyhow::bail!("Project is already running");
        }
    }

    let stop_notify = Arc::new(Notify::new());
    let stopped = Arc::new(AtomicBool::new(false));
    let any_failed = Arc::new(AtomicBool::new(false));
    let active_pids: Arc<Mutex<HashMap<String, u32>>> = Arc::new(Mutex::new(HashMap::new()));

    let mut tasks = vec![];
    for lane in project.lanes.clone() {
        let app_h = app.clone();
        let proj_id = project.id.clone();
        let mode = project.mode;
        let stop_on_error = project.stop_on_error;
        let auto_restart = project.auto_restart;
        let stop_n = stop_notify.clone();
        let stopped_c = stopped.clone();
        let failed_c = any_failed.clone();
        let pids = active_pids.clone();

        let task = tokio::spawn(async move {
            run_lane(
                app_h,
                proj_id,
                lane,
                mode,
                stop_on_error,
                auto_restart,
                stop_n,
                stopped_c,
                failed_c,
                pids,
            )
            .await;
        });
        tasks.push(task);
    }

    let done_notify = Arc::new(Notify::new());

    // Metrics poller: emits proc://metrics every 1s with aggregate CPU/MEM/uptime
    // for the project's process tree. Exits when watcher fires done_notify.
    let metrics_task = {
        let app_m = app.clone();
        let proj_id = project.id.clone();
        let pids_m = active_pids.clone();
        let done = done_notify.clone();
        let start_time = Instant::now();
        Some(tokio::spawn(async move {
            metrics_loop(app_m, proj_id, pids_m, done, start_time).await;
        }))
    };

    let handle = RunHandle {
        tasks,
        metrics_task,
        active_pids,
        stop_flag: stop_notify,
        stopped,
        any_failed,
        done_notify: done_notify.clone(),
    };
    {
        let mut runs = runner.runs.lock().await;
        runs.insert(project.id.clone(), handle);
    }

    let _ = app.emit(
        "proc://project",
        ProjectEvent {
            project_id: project.id.clone(),
            state: ProjectState::Running,
        },
    );

    // Watcher: wait for all lanes, emit terminal project state, clean up.
    let app_c = app.clone();
    let proj_id = project.id.clone();
    tokio::spawn(async move {
        let runner = app_c.state::<Runner>();
        let (tasks, metrics_task, stopped, any_failed, done_notify) = {
            let mut runs = runner.runs.lock().await;
            match runs.remove(&proj_id) {
                Some(h) => (
                    h.tasks,
                    h.metrics_task,
                    h.stopped,
                    h.any_failed,
                    h.done_notify,
                ),
                None => return,
            }
        };
        for t in tasks {
            let _ = t.await;
        }
        // Signal metrics poller to exit and join it.
        done_notify.notify_waiters();
        if let Some(m) = metrics_task {
            let _ = m.await;
        }
        let final_state = if stopped.load(Ordering::SeqCst) {
            ProjectState::Stopped
        } else if any_failed.load(Ordering::SeqCst) {
            ProjectState::Failed
        } else {
            ProjectState::Done
        };
        let _ = app_c.emit(
            "proc://project",
            ProjectEvent {
                project_id: proj_id,
                state: final_state,
            },
        );
    });

    Ok(())
}

pub async fn stop(app: AppHandle, project_id: &str) -> anyhow::Result<()> {
    let runner = app.state::<Runner>();
    let pids = {
        let runs = runner.runs.lock().await;
        let handle = match runs.get(project_id) {
            Some(h) => h,
            None => {
                // Not in our runs map — most likely the watcher already
                // emitted the terminal state but the UI's runningIds set
                // hasn't reconciled yet. Treat as idempotent success so the
                // UI can clear its stale flag without showing an error.
                let active: Vec<&String> = runs.keys().collect();
                eprintln!(
                    "[runner::stop] no handle for {:?}; active = {:?}",
                    project_id, active
                );
                return Ok(());
            }
        };
        handle.stopped.store(true, Ordering::SeqCst);
        handle.stop_flag.notify_waiters();
        let p = handle.active_pids.lock().await;
        p.values().copied().collect::<Vec<_>>()
    };
    let timeout = app.state::<SettingsState>().snapshot().kill_timeout_ms;
    for pid in pids {
        kill_tree(pid, timeout);
    }
    Ok(())
}

pub async fn list_running(app: &AppHandle) -> Vec<String> {
    let runner = app.state::<Runner>();
    let runs = runner.runs.lock().await;
    runs.keys().cloned().collect()
}

// ---------- Metrics ----------

fn collect_descendants(sys: &sysinfo::System, root: u32, out: &mut Vec<u32>) {
    out.push(root);
    // Build a parent → children index once per call.
    for (pid, process) in sys.processes() {
        let pid_u32 = pid.as_u32();
        if pid_u32 == root {
            continue;
        }
        if let Some(parent) = process.parent() {
            if parent.as_u32() == root {
                collect_descendants(sys, pid_u32, out);
            }
        }
    }
}

async fn metrics_loop(
    app: AppHandle,
    project_id: String,
    active_pids: Arc<Mutex<HashMap<String, u32>>>,
    done_notify: Arc<Notify>,
    start_time: Instant,
) {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

    let mut sys = System::new_with_specifics(
        RefreshKind::new()
            .with_processes(ProcessRefreshKind::new().with_cpu().with_memory()),
    );
    // Prime CPU stats — first read returns 0; we want first emit to be useful.
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new().with_cpu().with_memory(),
    );

    loop {
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_millis(1000)) => {}
            _ = done_notify.notified() => break,
        }

        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::new().with_cpu().with_memory(),
        );

        let roots: Vec<u32> = {
            let pids = active_pids.lock().await;
            pids.values().copied().collect()
        };

        let mut all_pids: Vec<u32> = vec![];
        for r in &roots {
            collect_descendants(&sys, *r, &mut all_pids);
        }
        all_pids.sort_unstable();
        all_pids.dedup();

        let mut total_cpu: f32 = 0.0;
        let mut total_mem_bytes: u64 = 0;
        let cpu_count = sys.cpus().len().max(1) as f32;
        for pid in &all_pids {
            if let Some(p) = sys.process(sysinfo::Pid::from_u32(*pid)) {
                total_cpu += p.cpu_usage();
                total_mem_bytes += p.memory();
            }
        }
        // sysinfo returns cpu_usage in % of one core (can exceed 100). Normalize
        // so a single fully-loaded core on an 8-core box reads as 12.5%.
        let normalized_cpu = total_cpu / cpu_count;

        let _ = app.emit(
            "proc://metrics",
            MetricsEvent {
                project_id: project_id.clone(),
                primary_pid: roots.first().copied(),
                pid_count: all_pids.len() as u32,
                cpu_pct: normalized_cpu,
                mem_mb: total_mem_bytes / 1024 / 1024,
                uptime_ms: start_time.elapsed().as_millis() as u64,
            },
        );
    }
}

// ---------- Lane / step execution ----------

#[allow(clippy::too_many_arguments)]
async fn run_lane(
    app: AppHandle,
    project_id: String,
    lane: Lane,
    mode: RunMode,
    stop_on_error: bool,
    auto_restart: bool,
    stop_notify: Arc<Notify>,
    stopped: Arc<AtomicBool>,
    any_failed: Arc<AtomicBool>,
    active_pids: Arc<Mutex<HashMap<String, u32>>>,
) {
    let _ = app.emit(
        "proc://lane",
        LaneEvent {
            project_id: project_id.clone(),
            lane_id: lane.id.clone(),
            state: LaneState::Running,
            pid: None,
        },
    );

    let cwd = if lane.path.trim().is_empty() {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default()
    } else {
        lane.path.clone()
    };

    let mut lane_failed = false;

    match mode {
        RunMode::Sequential => {
            for (idx, cmd) in lane.commands.iter().enumerate() {
                if stopped.load(Ordering::SeqCst) {
                    break;
                }
                if idx > 0 && cmd.delay_ms > 0 {
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_millis(cmd.delay_ms)) => {}
                        _ = stop_notify.notified() => { break; }
                    }
                }
                let ok = run_step_with_restart(
                    &app,
                    &project_id,
                    &lane.id,
                    idx,
                    &cmd.command,
                    &cwd,
                    auto_restart,
                    &stop_notify,
                    &stopped,
                    &active_pids,
                )
                .await;
                if !ok {
                    lane_failed = true;
                    if stop_on_error {
                        break;
                    }
                }
            }
        }
        RunMode::Parallel => {
            let mut handles = vec![];
            for (idx, cmd) in lane.commands.iter().enumerate() {
                let app_c = app.clone();
                let pid_s = project_id.clone();
                let lid_s = lane.id.clone();
                let cmd_s = cmd.command.clone();
                let cwd_s = cwd.clone();
                let notif = stop_notify.clone();
                let stopped_c = stopped.clone();
                let pids = active_pids.clone();
                let h = tokio::spawn(async move {
                    run_step_with_restart(
                        &app_c,
                        &pid_s,
                        &lid_s,
                        idx,
                        &cmd_s,
                        &cwd_s,
                        auto_restart,
                        &notif,
                        &stopped_c,
                        &pids,
                    )
                    .await
                });
                handles.push(h);
            }
            for h in handles {
                match h.await {
                    Ok(true) => {}
                    _ => lane_failed = true,
                }
            }
        }
    }

    if lane_failed {
        any_failed.store(true, Ordering::SeqCst);
    }

    let state = if stopped.load(Ordering::SeqCst) {
        LaneState::Stopped
    } else if lane_failed {
        LaneState::Failed
    } else {
        LaneState::Done
    };
    let _ = app.emit(
        "proc://lane",
        LaneEvent {
            project_id,
            lane_id: lane.id,
            state,
            pid: None,
        },
    );
}

/// Run a step, optionally restarting it on failure when `auto_restart` is true.
///
/// Restart loop:
/// - On success → return true immediately.
/// - On failure → wait 1s (or stop signal, whichever first) and retry.
/// - On stop → return immediately; the loop unwinds via the stop flag.
/// - If the command is intentionally empty → no restart, return true (skipped).
#[allow(clippy::too_many_arguments)]
async fn run_step_with_restart(
    app: &AppHandle,
    project_id: &str,
    lane_id: &str,
    step_idx: usize,
    command: &str,
    cwd: &str,
    auto_restart: bool,
    stop_notify: &Arc<Notify>,
    stopped: &Arc<AtomicBool>,
    active_pids: &Arc<Mutex<HashMap<String, u32>>>,
) -> bool {
    loop {
        let ok = run_step(
            app, project_id, lane_id, step_idx, command, cwd, stop_notify, active_pids,
        )
        .await;
        if ok || !auto_restart || stopped.load(Ordering::SeqCst) {
            return ok;
        }
        if command.trim().is_empty() {
            return true; // nothing to restart
        }
        emit_system(
            app,
            project_id,
            lane_id,
            step_idx,
            "[auto-restart] restarting in 1s…".into(),
        );
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {}
            _ = stop_notify.notified() => return false,
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_step(
    app: &AppHandle,
    project_id: &str,
    lane_id: &str,
    step_idx: usize,
    command: &str,
    cwd: &str,
    stop_notify: &Arc<Notify>,
    active_pids: &Arc<Mutex<HashMap<String, u32>>>,
) -> bool {
    if command.trim().is_empty() {
        let _ = app.emit(
            "proc://step",
            StepEvent {
                project_id: project_id.to_string(),
                lane_id: lane_id.to_string(),
                step_idx,
                state: StepState::Skipped,
                exit_code: None,
                elapsed_ms: 0,
            },
        );
        return true;
    }

    let start = Instant::now();
    let _ = app.emit(
        "proc://step",
        StepEvent {
            project_id: project_id.to_string(),
            lane_id: lane_id.to_string(),
            step_idx,
            state: StepState::Running,
            exit_code: None,
            elapsed_ms: 0,
        },
    );
    emit_system(
        app,
        project_id,
        lane_id,
        step_idx,
        format!(
            "$ {}    [cwd: {}]",
            command,
            if cwd.is_empty() { "<inherited>" } else { cwd }
        ),
    );

    let settings = app.state::<SettingsState>().snapshot();
    let mut tcmd = make_command(command, cwd, settings.windows_shell);
    let mut child = match tcmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                "proc://line",
                LineEvent {
                    project_id: project_id.to_string(),
                    lane_id: lane_id.to_string(),
                    step_idx,
                    stream: LogStream::Stderr,
                    text: format!("[spawn error] {}", e),
                    ts: now_ms(),
                },
            );
            let _ = app.emit(
                "proc://step",
                StepEvent {
                    project_id: project_id.to_string(),
                    lane_id: lane_id.to_string(),
                    step_idx,
                    state: StepState::Failed,
                    exit_code: None,
                    elapsed_ms: start.elapsed().as_millis() as u64,
                },
            );
            return false;
        }
    };

    let pid = child.id().unwrap_or(0);
    let key = format!("{}:{}", lane_id, step_idx);
    {
        let mut pids = active_pids.lock().await;
        pids.insert(key.clone(), pid);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = stdout.map(|s| {
        let app = app.clone();
        let p = project_id.to_string();
        let l = lane_id.to_string();
        tokio::spawn(async move {
            let mut reader = BufReader::new(s).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app.emit(
                    "proc://line",
                    LineEvent {
                        project_id: p.clone(),
                        lane_id: l.clone(),
                        step_idx,
                        stream: LogStream::Stdout,
                        text: line,
                        ts: now_ms(),
                    },
                );
            }
        })
    });

    let stderr_task = stderr.map(|s| {
        let app = app.clone();
        let p = project_id.to_string();
        let l = lane_id.to_string();
        tokio::spawn(async move {
            let mut reader = BufReader::new(s).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app.emit(
                    "proc://line",
                    LineEvent {
                        project_id: p.clone(),
                        lane_id: l.clone(),
                        step_idx,
                        stream: LogStream::Stderr,
                        text: line,
                        ts: now_ms(),
                    },
                );
            }
        })
    });

    let status = tokio::select! {
        s = child.wait() => s,
        _ = stop_notify.notified() => {
            kill_tree(pid, settings.kill_timeout_ms);
            child.wait().await
        }
    };

    {
        let mut pids = active_pids.lock().await;
        pids.remove(&key);
    }

    if let Some(t) = stdout_task {
        let _ = t.await;
    }
    if let Some(t) = stderr_task {
        let _ = t.await;
    }

    let exit_code = status.as_ref().ok().and_then(|s| s.code());
    let ok = matches!(&status, Ok(s) if s.success());

    let _ = app.emit(
        "proc://step",
        StepEvent {
            project_id: project_id.to_string(),
            lane_id: lane_id.to_string(),
            step_idx,
            state: if ok { StepState::Done } else { StepState::Failed },
            exit_code,
            elapsed_ms: start.elapsed().as_millis() as u64,
        },
    );

    ok
}
