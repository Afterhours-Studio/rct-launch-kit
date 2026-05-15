mod commands;
mod ports;
mod projects;
mod runner;
mod settings;

use runner::Runner;
use settings::SettingsState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::window::{Color, Effect, EffectsBuilder};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

/// Toggle the main window between hidden and visible-focused.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

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
                    let start_with_system = loaded.start_with_system;
                    app_handle.state::<SettingsState>().replace(loaded);
                    // Reconcile the OS autostart entry with the saved preference
                    // so manually flipping it via launchd / registry corrects
                    // itself on next launch.
                    commands::apply_autostart(&app_handle, start_with_system);
                }
            }

            // System tray — survives window close when the user chooses to
            // run in the background. Left-click toggles the main window;
            // the menu provides explicit Show/Quit.
            let show_item = MenuItem::with_id(app, "show", "Show Dev Launch Kit", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Dev Launch Kit")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

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
        .on_window_event(|window, event| {
            // Intercept the × button so we can honor the user's close
            // preference: quit outright, hide to tray, or ask via modal.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                let app = window.app_handle();
                let behavior = app.state::<SettingsState>().snapshot().close_behavior;
                match behavior.as_str() {
                    "quit" => {
                        // Fall through to default close → process exits.
                    }
                    "hide" => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    _ => {
                        // "ask" (default) — let the frontend show a modal and
                        // call back via quit_app / hide_to_tray commands.
                        api.prevent_close();
                        let _ = app.emit("app://close-requested", ());
                    }
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
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
            commands::get_app_version,
            commands::quit_app,
            commands::hide_to_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
