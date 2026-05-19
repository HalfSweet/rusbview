use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    menu::{
        AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
        WINDOW_SUBMENU_ID,
    },
    Emitter, Manager, Runtime, State,
};
use tracing::{error, info, warn};

pub mod history;
pub mod i18n;
pub mod logging;
pub mod monitor;
pub mod usb;

use history::{default_history_path, DeviceHistoryStore};
use i18n::{Locale, Message, Translator};
use monitor::{spawn_hotplug_monitor, MonitorEvent, UsbMonitorHandle};
use usb::{capture_snapshot, diff_snapshots, SnapshotDiff, UsbSnapshot};

const MENU_ID_SHOW_DEVICES: &str = "show-devices";
const MENU_ID_SHOW_SETTINGS: &str = "show-settings";
const MENU_EVENT_SHOW_DEVICES: &str = "menu-show-devices";
const MENU_EVENT_SHOW_SETTINGS: &str = "menu-show-settings";

#[derive(Debug)]
struct LoggingState {
    _guard: Option<logging::LoggingGuard>,
}

#[derive(Debug)]
struct MonitorState {
    _handle: Mutex<Option<UsbMonitorHandle>>,
}

#[derive(Debug)]
struct UsbAppState {
    inner: Mutex<UsbRuntime>,
}

#[derive(Debug)]
struct UsbRuntime {
    snapshot: Option<UsbSnapshot>,
    history: DeviceHistoryStore,
    status: String,
    history_path: String,
    log_dir: String,
    locale: Locale,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsbStatePayload {
    snapshot: Option<UsbSnapshot>,
    history: DeviceHistoryStore,
    status: String,
    history_path: String,
    log_dir: String,
    locale: Locale,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsbMonitorPayload {
    reason: String,
    connected: usize,
    disconnected: usize,
    state: UsbStatePayload,
}

impl UsbAppState {
    fn new(log_dir: String) -> Self {
        let history = DeviceHistoryStore::load_default().unwrap_or_else(|error| {
            warn!(?error, "failed to load device history");
            DeviceHistoryStore::default()
        });
        let history_path = default_history_path()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| "unavailable".to_string());

        Self {
            inner: Mutex::new(UsbRuntime {
                snapshot: None,
                history,
                status: "Starting USB monitor".to_string(),
                history_path,
                log_dir,
                locale: Locale::detect(),
            }),
        }
    }

    fn current(&self) -> Result<UsbStatePayload, String> {
        let guard = self.lock()?;
        Ok(Self::payload_from_runtime(&guard))
    }

    fn ensure_snapshot(&self) -> Result<UsbStatePayload, String> {
        if self.lock()?.snapshot.is_some() {
            return self.current();
        }

        let snapshot = capture_snapshot().map_err(|error| {
            error!(?error, "initial USB snapshot failed");
            format!("failed to profile USB devices: {error}")
        })?;
        self.apply_snapshot(snapshot, "USB snapshot loaded".to_string())
    }

    fn refresh(&self) -> Result<UsbStatePayload, String> {
        let snapshot = capture_snapshot().map_err(|error| {
            error!(?error, "manual USB refresh failed");
            format!("failed to profile USB devices: {error}")
        })?;
        self.apply_snapshot(snapshot, "USB snapshot refreshed".to_string())
    }

    fn apply_monitor_event(&self, event: MonitorEvent) -> Result<UsbMonitorPayload, String> {
        match event {
            MonitorEvent::Baseline(snapshot) => {
                let state =
                    self.apply_snapshot(snapshot, "USB hotplug monitor ready".to_string())?;
                Ok(UsbMonitorPayload {
                    reason: "baseline".to_string(),
                    connected: 0,
                    disconnected: 0,
                    state,
                })
            }
            MonitorEvent::Changed { snapshot, diff } => {
                let status = format!(
                    "USB topology changed: +{} -{}",
                    diff.connected.len(),
                    diff.disconnected.len()
                );
                let counts = (diff.connected.len(), diff.disconnected.len());
                let state = self.apply_snapshot_with_diff(snapshot, status, Some(diff))?;
                Ok(UsbMonitorPayload {
                    reason: "changed".to_string(),
                    connected: counts.0,
                    disconnected: counts.1,
                    state,
                })
            }
            MonitorEvent::Error(error) => {
                let mut guard = self.lock()?;
                guard.status = format!("USB monitor error: {error}");
                Ok(UsbMonitorPayload {
                    reason: "error".to_string(),
                    connected: 0,
                    disconnected: 0,
                    state: Self::payload_from_runtime(&guard),
                })
            }
        }
    }

    fn apply_snapshot(
        &self,
        snapshot: UsbSnapshot,
        status: String,
    ) -> Result<UsbStatePayload, String> {
        self.apply_snapshot_with_diff(snapshot, status, None)
    }

    fn apply_snapshot_with_diff(
        &self,
        snapshot: UsbSnapshot,
        status: String,
        diff: Option<SnapshotDiff>,
    ) -> Result<UsbStatePayload, String> {
        let mut guard = self.lock()?;
        if let Some(diff) = guard
            .snapshot
            .as_ref()
            .map(|previous| diff.unwrap_or_else(|| diff_snapshots(previous, &snapshot)))
        {
            guard.history.apply_diff(diff);
        } else {
            guard.history.observe_baseline(&snapshot);
        }

        guard.snapshot = Some(snapshot);
        guard.status = status;
        if let Err(error) = guard.history.save_default() {
            warn!(?error, "failed to save device history");
        }

        Ok(Self::payload_from_runtime(&guard))
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, UsbRuntime>, String> {
        self.inner
            .lock()
            .map_err(|_| "USB application state is unavailable".to_string())
    }

    fn payload_from_runtime(runtime: &UsbRuntime) -> UsbStatePayload {
        UsbStatePayload {
            snapshot: runtime.snapshot.clone(),
            history: runtime.history.clone(),
            status: runtime.status.clone(),
            history_path: runtime.history_path.clone(),
            log_dir: runtime.log_dir.clone(),
            locale: runtime.locale,
        }
    }
}

#[tauri::command]
fn get_usb_state(state: State<'_, UsbAppState>) -> Result<UsbStatePayload, String> {
    state.ensure_snapshot()
}

#[tauri::command]
fn refresh_usb_state(state: State<'_, UsbAppState>) -> Result<UsbStatePayload, String> {
    state.refresh()
}

fn build_app_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let translator = Translator::detected();
    let package_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(package_info.name.clone()),
        version: Some(package_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };

    let settings = MenuItem::with_id(
        app,
        MENU_ID_SHOW_SETTINGS,
        translator.text(Message::Settings),
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let devices = MenuItem::with_id(
        app,
        MENU_ID_SHOW_DEVICES,
        translator.text(Message::UsbExplorer),
        true,
        Some("CmdOrCtrl+1"),
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        translator.text(Message::Window),
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        translator.text(Message::Help),
        true,
        &[
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::about(app, None, Some(about_metadata.clone()))?,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                translator.text(Message::AppTitle),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about_metadata.clone()))?,
                    &PredefinedMenuItem::separator(app)?,
                    &settings,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                translator.text(Message::File),
                true,
                &[&PredefinedMenuItem::close_window(app, None)?],
            )?,
            #[cfg(not(target_os = "macos"))]
            &Submenu::with_items(
                app,
                translator.text(Message::File),
                true,
                &[
                    &settings,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                translator.text(Message::Edit),
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                translator.text(Message::View),
                true,
                &[
                    &devices,
                    #[cfg(target_os = "macos")]
                    &PredefinedMenuItem::separator(app)?,
                    #[cfg(target_os = "macos")]
                    &PredefinedMenuItem::fullscreen(app, None)?,
                ],
            )?,
            &window_menu,
            &help_menu,
        ],
    )
}

fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: tauri::menu::MenuEvent) {
    match event.id() {
        id if id == MENU_ID_SHOW_DEVICES => {
            if let Err(error) = app.emit(MENU_EVENT_SHOW_DEVICES, ()) {
                warn!(?error, "failed to emit USB explorer menu event");
            }
        }
        id if id == MENU_ID_SHOW_SETTINGS => {
            if let Err(error) = app.emit(MENU_EVENT_SHOW_SETTINGS, ()) {
                warn!(?error, "failed to emit settings menu event");
            }
        }
        _ => {}
    }
}

fn start_monitor(app: tauri::AppHandle) -> MonitorState {
    let (handle, rx) = spawn_hotplug_monitor();
    std::thread::Builder::new()
        .name("rusbview-tauri-monitor-pump".to_string())
        .spawn(move || {
            while let Ok(event) = rx.recv() {
                let state = app.state::<UsbAppState>();
                match state.apply_monitor_event(event) {
                    Ok(payload) => {
                        if let Err(error) = app.emit("usb-state-changed", payload) {
                            warn!(?error, "failed to emit USB monitor update");
                        }
                    }
                    Err(error) => {
                        warn!(%error, "failed to apply USB monitor event");
                    }
                }
            }
        })
        .expect("failed to spawn Tauri monitor pump");

    MonitorState {
        _handle: Mutex::new(Some(handle)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let logging_guard = match logging::init_logging() {
        Ok(guard) => {
            info!(log_dir = %guard.log_dir().display(), "logging initialized");
            Some(guard)
        }
        Err(error) => {
            eprintln!("failed to initialize logging: {error}");
            None
        }
    };
    let log_dir = logging_guard
        .as_ref()
        .map(|guard| guard.log_dir().display().to_string())
        .or_else(|| {
            logging::default_log_dir()
                .ok()
                .map(|path| path.display().to_string())
        })
        .unwrap_or_else(|| "unavailable".to_string());

    tauri::Builder::default()
        .menu(build_app_menu)
        .on_menu_event(handle_menu_event)
        .plugin(tauri_plugin_opener::init())
        .manage(LoggingState {
            _guard: logging_guard,
        })
        .manage(UsbAppState::new(log_dir))
        .setup(|app| {
            app.manage(start_monitor(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_usb_state, refresh_usb_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
