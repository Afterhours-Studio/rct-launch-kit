use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WindowsShell {
    Cmd,
    Powershell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: Theme,
    #[serde(rename = "maxLogLines")]
    pub max_log_lines: u32,
    #[serde(rename = "autoScroll")]
    pub auto_scroll: bool,
    #[serde(rename = "showTimestamps")]
    pub show_timestamps: bool,
    #[serde(rename = "confirmDelete")]
    pub confirm_delete: bool,
    #[serde(rename = "confirmStop")]
    pub confirm_stop: bool,
    #[serde(rename = "windowsShell")]
    pub windows_shell: WindowsShell,
    #[serde(rename = "killTimeoutMs")]
    pub kill_timeout_ms: u32,
    #[serde(rename = "autoCheckUpdates")]
    pub auto_check_updates: bool,
    #[serde(rename = "startWithSystem", default)]
    pub start_with_system: bool,
    /// What to do when the user clicks the window's × button.
    /// "ask"  → frontend pops a modal asking quit-vs-minimize.
    /// "quit" → exit the process.
    /// "hide" → hide the window; tray icon stays alive.
    #[serde(rename = "closeBehavior", default = "default_close_behavior")]
    pub close_behavior: String,
}

fn default_close_behavior() -> String {
    "ask".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            max_log_lines: 2000,
            auto_scroll: true,
            show_timestamps: true,
            confirm_delete: true,
            confirm_stop: false,
            windows_shell: WindowsShell::Cmd,
            kill_timeout_ms: 300,
            auto_check_updates: false,
            start_with_system: false,
            close_behavior: "ask".to_string(),
        }
    }
}

#[derive(Default)]
pub struct SettingsState(pub RwLock<Settings>);

impl SettingsState {
    pub fn snapshot(&self) -> Settings {
        self.0.read().expect("settings lock poisoned").clone()
    }

    pub fn replace(&self, next: Settings) {
        *self.0.write().expect("settings lock poisoned") = next;
    }
}

pub fn settings_file(dir: &Path) -> PathBuf {
    dir.join("settings.json")
}

pub fn load(dir: &Path) -> anyhow::Result<Settings> {
    let p = settings_file(dir);
    if !p.exists() {
        return Ok(Settings::default());
    }
    let content = std::fs::read_to_string(&p)?;
    let parsed: Settings = serde_json::from_str(&content)?;
    Ok(parsed)
}

pub fn save(dir: &Path, settings: &Settings) -> anyhow::Result<()> {
    std::fs::create_dir_all(dir)?;
    let p = settings_file(dir);
    let content = serde_json::to_string_pretty(settings)?;
    std::fs::write(&p, content)?;
    Ok(())
}
