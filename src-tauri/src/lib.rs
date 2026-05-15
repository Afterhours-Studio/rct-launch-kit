mod commands;
mod ports;
mod projects;
mod runner;
mod settings;

use runner::Runner;
use settings::SettingsState;
use tauri::window::{Color, Effect, EffectsBuilder};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Runner::default())
        .manage(SettingsState::default())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_effects(
                EffectsBuilder::new()
                    .effect(Effect::Acrylic)
                    .color(Color(0, 0, 0, 219))
                    .build(),
            )?;

            // Load settings from disk into the managed state.
            let app_handle = app.handle().clone();
            if let Ok(dir) = app_handle.path().app_data_dir() {
                if let Ok(loaded) = settings::load(&dir) {
                    app_handle.state::<SettingsState>().replace(loaded);
                }
            }

            // Auto-run projects flagged with autoRun=true.
            let auto_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let dir = match auto_handle.path().app_data_dir() {
                    Ok(d) => d,
                    Err(_) => return,
                };
                let projects = match projects::load(&dir) {
                    Ok(p) => p,
                    Err(_) => return,
                };
                for p in projects.into_iter().filter(|p| p.auto_run) {
                    let _ = runner::start(auto_handle.clone(), p).await;
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::save_projects,
            commands::start_project,
            commands::stop_project,
            commands::list_running,
            commands::get_settings,
            commands::save_settings,
            commands::reset_settings,
            commands::check_update,
            commands::list_listening_ports,
            commands::kill_port_process,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
