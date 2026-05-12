use std::collections::BTreeSet;
use std::sync::mpsc::Receiver;
use std::time::Duration;

use gpui::{
    div, prelude::*, px, rgb, size, App, AppContext, Application, AsyncApp, Bounds, Context, Hsla,
    InteractiveElement, IntoElement, Render, SharedString, StatefulInteractiveElement, Timer,
    TitlebarOptions, WeakEntity, Window, WindowAppearance, WindowBounds, WindowOptions,
};
use tracing::{error, warn};

use crate::history::{default_history_path, DeviceHistoryStore};
use crate::i18n::{Message, Translator};
use crate::logging;
use crate::monitor::{spawn_hotplug_monitor, MonitorEvent, UsbMonitorHandle};
use crate::usb::{capture_snapshot, DescriptorSection, UsbBus, UsbDevice, UsbSnapshot};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy)]
struct Palette {
    background: Hsla,
    surface: Hsla,
    sidebar: Hsla,
    row: Hsla,
    row_hover: Hsla,
    selected: Hsla,
    text: Hsla,
    muted: Hsla,
    border: Hsla,
    accent: Hsla,
    success: Hsla,
    danger: Hsla,
}

pub struct RusbviewApp {
    translator: Translator,
    theme: ThemeMode,
    snapshot: Option<UsbSnapshot>,
    selected_device: Option<String>,
    history: DeviceHistoryStore,
    history_path: String,
    status: String,
    expanded_nodes: BTreeSet<String>,
    tree_initialized: bool,
    _monitor: UsbMonitorHandle,
    monitor_rx: Receiver<MonitorEvent>,
}

pub fn run() {
    let _logging_guard = match logging::init_logging() {
        Ok(guard) => Some(guard),
        Err(error) => {
            eprintln!("failed to initialize logging: {error}");
            None
        }
    };

    Application::new().run(|cx: &mut App| {
        let bounds = Bounds::centered(None, size(px(1180.0), px(760.0)), cx);
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            titlebar: Some(TitlebarOptions {
                title: Some(SharedString::from("rusbview")),
                ..Default::default()
            }),
            window_min_size: Some(size(px(920.0), px(620.0))),
            ..Default::default()
        };

        cx.open_window(options, |_, cx| cx.new(RusbviewApp::new))
            .expect("failed to open rusbview window");
        cx.activate(true);
    });
}

impl RusbviewApp {
    fn new(cx: &mut Context<Self>) -> Self {
        let (monitor, monitor_rx) = spawn_hotplug_monitor();
        let history = DeviceHistoryStore::load_default().unwrap_or_else(|error| {
            warn!(?error, "failed to load device history");
            DeviceHistoryStore::default()
        });
        let history_path = default_history_path()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| "unavailable".to_string());

        let mut app = Self {
            translator: Translator::detected(),
            theme: ThemeMode::System,
            snapshot: None,
            selected_device: None,
            history,
            history_path,
            status: "Starting USB monitor".to_string(),
            expanded_nodes: BTreeSet::new(),
            tree_initialized: false,
            _monitor: monitor,
            monitor_rx,
        };
        app.refresh_now();
        app.spawn_monitor_pump(cx);
        app
    }

    fn spawn_monitor_pump(&self, cx: &mut Context<Self>) {
        cx.spawn(
            async move |this: WeakEntity<Self>, cx: &mut AsyncApp| loop {
                Timer::after(Duration::from_millis(350)).await;
                if this
                    .update(&mut *cx, |view, cx| {
                        if view.drain_monitor_events() {
                            cx.notify();
                        }
                    })
                    .is_err()
                {
                    break;
                }
            },
        )
        .detach();
    }

    fn refresh_now(&mut self) {
        match capture_snapshot() {
            Ok(snapshot) => {
                self.apply_snapshot(snapshot, None);
                self.status = "USB snapshot refreshed".to_string();
            }
            Err(error) => {
                self.status = format!("Failed to profile USB devices: {error}");
                error!(?error, "manual USB refresh failed");
            }
        }
    }

    fn drain_monitor_events(&mut self) -> bool {
        let mut changed = false;
        while let Ok(event) = self.monitor_rx.try_recv() {
            changed = true;
            match event {
                MonitorEvent::Baseline(snapshot) => {
                    self.apply_snapshot(snapshot, Some("USB hotplug monitor ready".to_string()));
                }
                MonitorEvent::Changed { snapshot, diff } => {
                    let status = format!(
                        "USB topology changed: +{} -{}",
                        diff.connected.len(),
                        diff.disconnected.len()
                    );
                    self.apply_snapshot(snapshot, Some(status));
                }
                MonitorEvent::Error(error) => {
                    self.status = format!("USB monitor error: {error}");
                }
            }
        }
        changed
    }

    fn apply_snapshot(&mut self, snapshot: UsbSnapshot, status: Option<String>) {
        if let Some(previous) = &self.snapshot {
            self.history.apply_transition(previous, &snapshot);
        } else {
            self.history.observe_baseline(&snapshot);
        }

        self.snapshot = Some(snapshot);
        self.initialize_tree_expansion();
        self.ensure_selection();
        if let Err(error) = self.history.save_default() {
            warn!(?error, "failed to save device history");
        }
        if let Some(status) = status {
            self.status = status;
        }
    }

    fn ensure_selection(&mut self) {
        let selected_exists = self
            .selected_device
            .as_ref()
            .and_then(|key| self.snapshot.as_ref()?.find_device(key))
            .is_some();

        if selected_exists {
            return;
        }

        self.selected_device = self.snapshot.as_ref().and_then(|snapshot| {
            snapshot
                .flattened_devices()
                .first()
                .map(|device| device.instance_key.clone())
        });
    }

    fn selected_device(&self) -> Option<&UsbDevice> {
        let key = self.selected_device.as_ref()?;
        self.snapshot.as_ref()?.find_device(key)
    }

    fn set_theme(&mut self, theme: ThemeMode, cx: &mut Context<Self>) {
        self.theme = theme;
        cx.notify();
    }

    fn toggle_tree_node(&mut self, key: String, cx: &mut Context<Self>) {
        if !self.expanded_nodes.insert(key.clone()) {
            self.expanded_nodes.remove(&key);
        }
        cx.notify();
    }

    fn initialize_tree_expansion(&mut self) {
        if self.tree_initialized {
            return;
        }

        if let Some(snapshot) = &self.snapshot {
            let mut keys = Vec::new();
            for bus in &snapshot.buses {
                if !bus.devices.is_empty() {
                    keys.push(Self::bus_tree_key(bus));
                }
                for device in &bus.devices {
                    Self::collect_expanded_device_keys(device, &mut keys);
                }
            }
            self.expanded_nodes.extend(keys);
            self.tree_initialized = true;
        }
    }

    fn collect_expanded_device_keys(device: &UsbDevice, keys: &mut Vec<String>) {
        if !device.children.is_empty() {
            keys.push(Self::device_tree_key(device));
        }
        for child in &device.children {
            Self::collect_expanded_device_keys(child, keys);
        }
    }

    fn bus_tree_key(bus: &UsbBus) -> String {
        format!("bus:{}", bus.key)
    }

    fn device_tree_key(device: &UsbDevice) -> String {
        format!("device:{}", device.instance_key)
    }

    fn device_count(devices: &[UsbDevice]) -> usize {
        devices
            .iter()
            .map(|device| 1 + Self::device_count(&device.children))
            .sum()
    }

    fn palette(&self, window: &Window) -> Palette {
        let system_dark = matches!(
            window.appearance(),
            WindowAppearance::Dark | WindowAppearance::VibrantDark
        );
        let dark = match self.theme {
            ThemeMode::System => system_dark,
            ThemeMode::Light => false,
            ThemeMode::Dark => true,
        };

        if dark {
            Palette {
                background: rgb(0x111318).into(),
                surface: rgb(0x1b2028).into(),
                sidebar: rgb(0x171b22).into(),
                row: rgb(0x202633).into(),
                row_hover: rgb(0x283140).into(),
                selected: rgb(0x164e63).into(),
                text: rgb(0xe7edf5).into(),
                muted: rgb(0x9aa6b6).into(),
                border: rgb(0x313947).into(),
                accent: rgb(0x38bdf8).into(),
                success: rgb(0x34d399).into(),
                danger: rgb(0xfb7185).into(),
            }
        } else {
            Palette {
                background: rgb(0xf4f6f8).into(),
                surface: rgb(0xffffff).into(),
                sidebar: rgb(0xe9eef4).into(),
                row: rgb(0xf8fafc).into(),
                row_hover: rgb(0xe7eef7).into(),
                selected: rgb(0xcfe8f6).into(),
                text: rgb(0x17202a).into(),
                muted: rgb(0x5f6f83).into(),
                border: rgb(0xcfd8e3).into(),
                accent: rgb(0x0f766e).into(),
                success: rgb(0x047857).into(),
                danger: rgb(0xbe123c).into(),
            }
        }
    }

    fn t(&self, message: Message) -> &'static str {
        self.translator.text(message)
    }

    fn render_toolbar(&self, palette: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap_3()
            .px_4()
            .py_3()
            .border_b_1()
            .border_color(palette.border)
            .bg(palette.surface)
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(gpui::FontWeight::MEDIUM)
                            .text_color(palette.text)
                            .child(self.t(Message::AppTitle)),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(palette.muted)
                            .child(self.status.clone()),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(self.render_theme_button(ThemeMode::System, palette, cx))
                    .child(self.render_theme_button(ThemeMode::Light, palette, cx))
                    .child(self.render_theme_button(ThemeMode::Dark, palette, cx))
                    .child(
                        div()
                            .cursor_pointer()
                            .px_3()
                            .py_1()
                            .rounded_sm()
                            .border_1()
                            .border_color(palette.border)
                            .bg(palette.row)
                            .hover(move |style| style.bg(palette.row_hover))
                            .text_color(palette.text)
                            .text_sm()
                            .child(self.t(Message::Refresh))
                            .id("refresh")
                            .on_click(cx.listener(|view, _, _, cx| {
                                view.refresh_now();
                                cx.notify();
                            })),
                    ),
            )
    }

    fn render_theme_button(
        &self,
        theme: ThemeMode,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let label = match theme {
            ThemeMode::System => self.t(Message::System),
            ThemeMode::Light => self.t(Message::Light),
            ThemeMode::Dark => self.t(Message::Dark),
        };
        let is_selected = self.theme == theme;
        div()
            .cursor_pointer()
            .px_3()
            .py_1()
            .rounded_sm()
            .border_1()
            .border_color(if is_selected {
                palette.accent
            } else {
                palette.border
            })
            .bg(if is_selected {
                palette.selected
            } else {
                palette.surface
            })
            .hover(move |style| style.bg(palette.row_hover))
            .text_color(if is_selected {
                palette.text
            } else {
                palette.muted
            })
            .text_sm()
            .child(label)
            .id(SharedString::from(format!("theme-{theme:?}")))
            .on_click(cx.listener(move |view, _, _, cx| {
                view.set_theme(theme, cx);
            }))
    }

    fn render_sidebar(&self, palette: Palette, cx: &mut Context<Self>) -> impl IntoElement {
        let content = if let Some(snapshot) = &self.snapshot {
            div().flex().flex_col().gap_1().children(
                snapshot
                    .buses
                    .iter()
                    .map(|bus| self.render_bus_node(bus, palette, cx)),
            )
        } else {
            div()
                .flex()
                .items_center()
                .justify_center()
                .text_color(palette.muted)
                .child(self.t(Message::EmptyTopology))
        };

        div()
            .w(px(360.0))
            .min_w(px(300.0))
            .h_full()
            .flex()
            .flex_col()
            .border_r_1()
            .border_color(palette.border)
            .bg(palette.sidebar)
            .child(
                div()
                    .px_4()
                    .py_3()
                    .border_b_1()
                    .border_color(palette.border)
                    .text_color(palette.text)
                    .font_weight(gpui::FontWeight::MEDIUM)
                    .child(self.t(Message::Devices)),
            )
            .child(
                div()
                    .flex_1()
                    .id("sidebar-scroll")
                    .overflow_y_scroll()
                    .p_3()
                    .child(content),
            )
    }

    fn render_bus_node(
        &self,
        bus: &UsbBus,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let tree_key = Self::bus_tree_key(bus);
        let has_children = !bus.devices.is_empty();
        let is_expanded = self.expanded_nodes.contains(&tree_key);
        let device_count = Self::device_count(&bus.devices);
        let toggle_key = tree_key.clone();
        let mut node = div().flex().flex_col().gap_1().child(
            div()
                .flex()
                .items_center()
                .gap_2()
                .px_2()
                .py_1()
                .rounded_sm()
                .bg(palette.sidebar)
                .hover(move |style| style.bg(palette.row_hover))
                .child(self.render_tree_toggle(toggle_key, has_children, is_expanded, palette, cx))
                .child(
                    div()
                        .flex_1()
                        .min_w(px(0.0))
                        .cursor_pointer()
                        .child(
                            div()
                                .truncate()
                                .text_sm()
                                .text_color(palette.text)
                                .child(bus.name.clone()),
                        )
                        .child(
                            div()
                                .truncate()
                                .text_xs()
                                .text_color(palette.muted)
                                .child(format!("{} - {device_count} devices", bus.controller)),
                        )
                        .id(SharedString::from(format!("bus-label-{}", bus.key)))
                        .on_click(cx.listener(move |view, _, _, cx| {
                            view.toggle_tree_node(tree_key.clone(), cx);
                        })),
                ),
        );

        if is_expanded {
            node = node.children(
                bus.devices
                    .iter()
                    .map(|device| self.render_device_node(device, 1, palette, cx)),
            );
        }

        node.into_any_element()
    }

    fn render_device_node(
        &self,
        device: &UsbDevice,
        depth: usize,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let key = device.instance_key.clone();
        let tree_key = Self::device_tree_key(device);
        let has_children = !device.children.is_empty();
        let is_expanded = self.expanded_nodes.contains(&tree_key);
        let is_selected = self.selected_device.as_deref() == Some(device.instance_key.as_str());
        let history = self.history.get(&device.identity);
        let insertions = history.map(|history| history.insertions).unwrap_or(0);
        let removals = history.map(|history| history.removals).unwrap_or(0);
        let left_padding = 10.0 + (depth as f32 * 18.0);

        let toggle_key = tree_key.clone();
        let row = div()
            .id(SharedString::from(format!(
                "device-{}",
                device.instance_key
            )))
            .flex()
            .items_center()
            .justify_between()
            .gap_2()
            .pl(px(left_padding))
            .pr_2()
            .py_1()
            .rounded_sm()
            .bg(if is_selected {
                palette.selected
            } else {
                palette.sidebar
            })
            .hover(move |style| style.bg(palette.row_hover))
            .border_1()
            .border_color(if is_selected {
                palette.accent
            } else {
                palette.sidebar
            })
            .child(self.render_tree_toggle(toggle_key, has_children, is_expanded, palette, cx))
            .child(
                div()
                    .cursor_pointer()
                    .flex_1()
                    .min_w(px(0.0))
                    .py_1()
                    .id(SharedString::from(format!(
                        "device-label-{}",
                        device.instance_key
                    )))
                    .on_click(cx.listener(move |view, _, _, cx| {
                        view.selected_device = Some(key.clone());
                        cx.notify();
                    }))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_1()
                            .min_w(px(0.0))
                            .child(
                                div()
                                    .truncate()
                                    .text_color(palette.text)
                                    .text_sm()
                                    .child(device.display_name.clone()),
                            )
                            .child(div().truncate().text_xs().text_color(palette.muted).child(
                                format!(
                                    "{:04x}:{:04x}  {}",
                                    device.identity.vendor_id.unwrap_or(0),
                                    device.identity.product_id.unwrap_or(0),
                                    device.port_path
                                ),
                            )),
                    ),
            )
            .child(
                div()
                    .flex_none()
                    .w(px(48.0))
                    .flex()
                    .justify_end()
                    .gap_1()
                    .text_xs()
                    .child(
                        div()
                            .text_color(palette.success)
                            .child(format!("+{insertions}")),
                    )
                    .child(
                        div()
                            .text_color(palette.danger)
                            .child(format!("-{removals}")),
                    ),
            );

        let mut node = div().flex().flex_col().gap_1().child(row);

        if is_expanded {
            node = node.children(
                device
                    .children
                    .iter()
                    .map(|child| self.render_device_node(child, depth + 1, palette, cx)),
            );
        }

        node.into_any_element()
    }

    fn render_tree_toggle(
        &self,
        key: String,
        has_children: bool,
        is_expanded: bool,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        if has_children {
            let label = if is_expanded { "v" } else { ">" };
            div()
                .flex_none()
                .w(px(22.0))
                .h(px(24.0))
                .flex()
                .items_center()
                .justify_center()
                .rounded_sm()
                .cursor_pointer()
                .text_sm()
                .text_color(palette.muted)
                .hover(move |style| style.bg(palette.row_hover).text_color(palette.text))
                .child(label)
                .id(SharedString::from(format!("toggle-{key}")))
                .on_click(cx.listener(move |view, _, _, cx| {
                    view.toggle_tree_node(key.clone(), cx);
                }))
                .into_any_element()
        } else {
            div().flex_none().w(px(22.0)).h(px(24.0)).into_any_element()
        }
    }

    fn render_content(&self, palette: Palette) -> impl IntoElement {
        let device = self.selected_device().cloned();
        div()
            .flex_1()
            .h_full()
            .flex()
            .flex_col()
            .bg(palette.background)
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_5()
                    .py_3()
                    .border_b_1()
                    .border_color(palette.border)
                    .bg(palette.surface)
                    .child(
                        div()
                            .text_color(palette.text)
                            .font_weight(gpui::FontWeight::MEDIUM)
                            .child(self.t(Message::Details)),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(palette.muted)
                            .child(format!("history: {}", self.history_path)),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .id("detail-scroll")
                    .overflow_y_scroll()
                    .p_5()
                    .child(match device {
                        Some(device) => self
                            .render_device_detail(&device, palette)
                            .into_any_element(),
                        None => div()
                            .size_full()
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_color(palette.muted)
                            .child(self.t(Message::NoDeviceSelected))
                            .into_any_element(),
                    }),
            )
    }

    fn render_device_detail(&self, device: &UsbDevice, palette: Palette) -> impl IntoElement {
        let history = self.history.get(&device.identity);
        div()
            .flex()
            .flex_col()
            .gap_4()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .p_4()
                    .rounded_sm()
                    .border_1()
                    .border_color(palette.border)
                    .bg(palette.surface)
                    .child(
                        div()
                            .text_xl()
                            .font_weight(gpui::FontWeight::MEDIUM)
                            .text_color(palette.text)
                            .child(device.display_name.clone()),
                    )
                    .child(div().text_sm().text_color(palette.muted).child(format!(
                        "{} {} - Bus {:03} Device {:03}",
                        device.vendor_name,
                        device.product_name,
                        device.bus_number,
                        device.device_address
                    )))
                    .child(div().flex().gap_2().children([
                        self.render_pill(
                            format!(
                                "VID:PID {:04x}:{:04x}",
                                device.identity.vendor_id.unwrap_or(0),
                                device.identity.product_id.unwrap_or(0)
                            ),
                            palette,
                        ),
                        self.render_pill(format!("Path {}", device.port_path), palette),
                        self.render_pill(
                            format!(
                                "{} {}",
                                self.t(Message::Connected),
                                history.map(|h| h.insertions).unwrap_or(0)
                            ),
                            palette,
                        ),
                        self.render_pill(
                            format!(
                                "{} {}",
                                self.t(Message::Disconnected),
                                history.map(|h| h.removals).unwrap_or(0)
                            ),
                            palette,
                        ),
                    ])),
            )
            .child(div().grid().grid_cols(2).gap_3().children([
                self.render_fact("Manufacturer", device.manufacturer.clone(), palette),
                self.render_fact("Serial", device.identity.serial.clone(), palette),
                self.render_fact("Class", device.class.clone(), palette),
                self.render_fact(
                    "Subclass",
                    device.sub_class.map(|v| format!("0x{v:02x}")),
                    palette,
                ),
                self.render_fact(
                    "Protocol",
                    device.protocol.map(|v| format!("0x{v:02x}")),
                    palette,
                ),
                self.render_fact("Advertised speed", device.device_speed.clone(), palette),
                self.render_fact("Negotiated speed", device.negotiated_speed.clone(), palette),
                self.render_fact("Last event", device.last_event.clone(), palette),
            ]))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(gpui::FontWeight::MEDIUM)
                            .text_color(palette.text)
                            .child(self.t(Message::Descriptors)),
                    )
                    .children(
                        device
                            .descriptor_sections
                            .iter()
                            .map(|section| self.render_descriptor_section(section, 0, palette)),
                    ),
            )
    }

    fn render_pill(&self, text: String, palette: Palette) -> impl IntoElement {
        div()
            .px_2()
            .py_1()
            .rounded_sm()
            .border_1()
            .border_color(palette.border)
            .bg(palette.row)
            .text_xs()
            .text_color(palette.text)
            .child(text)
    }

    fn render_fact(
        &self,
        label: &str,
        value: Option<String>,
        palette: Palette,
    ) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .gap_1()
            .p_3()
            .rounded_sm()
            .border_1()
            .border_color(palette.border)
            .bg(palette.surface)
            .child(
                div()
                    .text_xs()
                    .text_color(palette.muted)
                    .child(label.to_string()),
            )
            .child(
                div()
                    .text_sm()
                    .text_color(palette.text)
                    .line_clamp(2)
                    .child(value.unwrap_or_else(|| "N/A".to_string())),
            )
    }

    fn render_descriptor_section(
        &self,
        section: &DescriptorSection,
        depth: usize,
        palette: Palette,
    ) -> gpui::AnyElement {
        let left_padding = 12.0 + (depth as f32 * 14.0);
        div()
            .flex()
            .flex_col()
            .rounded_sm()
            .border_1()
            .border_color(palette.border)
            .bg(palette.surface)
            .child(
                div()
                    .pl(px(left_padding))
                    .pr_3()
                    .py_2()
                    .border_b_1()
                    .border_color(palette.border)
                    .text_color(palette.text)
                    .font_weight(gpui::FontWeight::MEDIUM)
                    .child(section.title.clone()),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .children(section.fields.iter().map(|field| {
                        div()
                            .grid()
                            .grid_cols(2)
                            .gap_3()
                            .px_3()
                            .py_2()
                            .border_b_1()
                            .border_color(palette.border)
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(palette.muted)
                                    .child(field.name.clone()),
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(palette.text)
                                    .whitespace_normal()
                                    .child(field.value.clone()),
                            )
                    }))
                    .children(
                        section
                            .children
                            .iter()
                            .map(|child| self.render_descriptor_section(child, depth + 1, palette)),
                    ),
            )
            .into_any_element()
    }
}

impl Render for RusbviewApp {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let palette = self.palette(window);
        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(palette.background)
            .text_color(palette.text)
            .font_family(".AppleSystemUIFont, Segoe UI, Inter, sans-serif")
            .child(self.render_toolbar(palette, cx))
            .child(
                div()
                    .flex_1()
                    .min_h(px(0.0))
                    .flex()
                    .child(self.render_sidebar(palette, cx))
                    .child(self.render_content(palette)),
            )
    }
}
