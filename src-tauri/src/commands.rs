use crate::ports::{self, PortEntry};
use crate::projects::{self, Project};
use crate::runner::{self, Runner};
use crate::settings::{self, Settings, SettingsState};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

/// Sync the OS autostart entry with the desired state. Errors are swallowed
/// so a flaky launchd / registry call never blocks a settings save.
pub fn apply_autostart(app: &AppHandle, enabled: bool) {
    let mgr = app.autolaunch();
    let currently = mgr.is_enabled().unwrap_or(false);
    if enabled && !currently {
        let _ = mgr.enable();
    } else if !enabled && currently {
        let _ = mgr.disable();
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

// ---------- Projects ----------

#[tauri::command]
pub async fn list_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let dir = data_dir(&app)?;
    projects::load(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_projects(app: AppHandle, projects: Vec<Project>) -> Result<(), String> {
    let dir = data_dir(&app)?;
    projects::save(&dir, &projects).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_project(app: AppHandle, project: Project) -> Result<(), String> {
    runner::start(app, project).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_project(app: AppHandle, project_id: String) -> Result<(), String> {
    runner::stop(app, &project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_running(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(runner::list_running(&app).await)
}

/// Current app version, baked in at compile time from Cargo.toml.
/// CI/CD's "Stamp version" step rewrites Cargo.toml so each release exe
/// reports its own tag without any runtime config to read.
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ---------- Window lifecycle ----------

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn hide_to_tray(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

// ---------- Port Explorer ----------

#[tauri::command]
pub async fn list_listening_ports(app: AppHandle) -> Result<Vec<PortEntry>, String> {
    // Collect PIDs owned by our launcher so the UI can mark them.
    let runner = app.state::<Runner>();
    let owned_pids: Vec<u32> = {
        let runs = runner.runs.lock().await;
        let mut acc = Vec::new();
        for handle in runs.values() {
            let pids = handle.active_pids.lock().await;
            acc.extend(pids.values().copied());
        }
        acc
    };
    ports::list_listening(&owned_pids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_port_process(pid: u32) -> Result<(), String> {
    ports::kill_pid(pid).map_err(|e| e.to_string())
}

// ---------- Settings ----------

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let state = app.state::<SettingsState>();
    Ok(state.snapshot())
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let dir = data_dir(&app)?;
    settings::save(&dir, &settings).map_err(|e| e.to_string())?;
    apply_autostart(&app, settings.start_with_system);
    let state = app.state::<SettingsState>();
    state.replace(settings);
    Ok(())
}

#[tauri::command]
pub async fn reset_settings(app: AppHandle) -> Result<Settings, String> {
    let dir = data_dir(&app)?;
    let defaults = Settings::default();
    settings::save(&dir, &defaults).map_err(|e| e.to_string())?;
    apply_autostart(&app, defaults.start_with_system);
    let state = app.state::<SettingsState>();
    state.replace(defaults.clone());
    Ok(defaults)
}

// ---------- Updates ----------

const REPO_OWNER: &str = "Afterhours-Studio";
const REPO_NAME: &str = "rct-launch-kit";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: Option<String>,
    pub has_update: bool,
    pub release_url: Option<String>,
    pub published_at: Option<String>,
    pub notes: Option<String>,
    pub source: UpdateSource,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateSource {
    Github,
    Local,
}

fn parse_semver(v: &str) -> Option<(u32, u32, u32)> {
    let trimmed = v.trim().trim_start_matches('v');
    let parts: Vec<&str> = trimmed.split(|c: char| c == '.' || c == '-').collect();
    let major = parts.first()?.parse::<u32>().ok()?;
    let minor = parts.get(1)?.parse::<u32>().ok()?;
    let patch = parts.get(2)?.parse::<u32>().ok()?;
    Some((major, minor, patch))
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();

    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        REPO_OWNER, REPO_NAME
    );

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent(format!("rct-launch-kit/{}", current))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(format!("http client init: {}", e)),
    };

    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            // Network failures shouldn't surface as a hard error — degrade
            // gracefully so the UI can show "Could not reach update server".
            return Ok(UpdateInfo {
                current,
                latest: None,
                has_update: false,
                release_url: None,
                published_at: None,
                notes: Some(format!("Network error: {}", e)),
                source: UpdateSource::Local,
            });
        }
    };

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        // Repo or release not published — treat as up-to-date.
        return Ok(UpdateInfo {
            current,
            latest: None,
            has_update: false,
            release_url: None,
            published_at: None,
            notes: Some("No releases published yet.".into()),
            source: UpdateSource::Github,
        });
    }
    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            current,
            latest: None,
            has_update: false,
            release_url: None,
            published_at: None,
            notes: Some(format!("HTTP {}", resp.status())),
            source: UpdateSource::Github,
        });
    }

    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => return Err(format!("invalid response: {}", e)),
    };

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim_start_matches('v').to_string());
    let release_url = json
        .get("html_url")
        .and_then(|v| v.as_str())
        .map(String::from);
    let published_at = json
        .get("published_at")
        .and_then(|v| v.as_str())
        .map(String::from);
    let notes = json
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.lines().take(8).collect::<Vec<_>>().join("\n"));

    let has_update = match (parse_semver(&current), tag.as_deref().and_then(parse_semver)) {
        (Some(c), Some(l)) => l > c,
        _ => tag.as_deref().map(|t| t != current).unwrap_or(false),
    };

    Ok(UpdateInfo {
        current,
        latest: tag,
        has_update,
        release_url,
        published_at,
        notes,
        source: UpdateSource::Github,
    })
}
