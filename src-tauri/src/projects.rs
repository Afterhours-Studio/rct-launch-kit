use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub id: String,
    pub command: String,
    #[serde(rename = "delayMs")]
    pub delay_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lane {
    pub id: String,
    pub path: String,
    pub commands: Vec<Command>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunMode {
    Sequential,
    Parallel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub lanes: Vec<Lane>,
    #[serde(rename = "activeLaneId")]
    pub active_lane_id: String,
    pub mode: RunMode,
    #[serde(rename = "stopOnError")]
    pub stop_on_error: bool,
    #[serde(rename = "autoRestart")]
    pub auto_restart: bool,
    #[serde(default, rename = "autoRun")]
    pub auto_run: bool,
}

pub fn projects_file(dir: &Path) -> PathBuf {
    dir.join("projects.json")
}

pub fn load(dir: &Path) -> anyhow::Result<Vec<Project>> {
    let p = projects_file(dir);
    if !p.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&p)?;
    let parsed: Vec<Project> = serde_json::from_str(&content)?;
    Ok(parsed)
}

pub fn save(dir: &Path, projects: &[Project]) -> anyhow::Result<()> {
    std::fs::create_dir_all(dir)?;
    let p = projects_file(dir);
    let content = serde_json::to_string_pretty(projects)?;
    std::fs::write(&p, content)?;
    Ok(())
}
