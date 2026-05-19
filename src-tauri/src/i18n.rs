use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Locale {
    En,
    ZhHans,
}

impl Locale {
    pub fn detect() -> Self {
        let env_locale = std::env::var("RUSBVIEW_LANG")
            .or_else(|_| std::env::var("LANG"))
            .unwrap_or_default()
            .to_lowercase();

        if env_locale.starts_with("zh") {
            Locale::ZhHans
        } else {
            Locale::En
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Message {
    AppTitle,
    Refresh,
    Theme,
    Light,
    Dark,
    System,
    Devices,
    Details,
    Descriptors,
    Logs,
    Settings,
    UsbExplorer,
    File,
    Edit,
    View,
    Window,
    Help,
    Insertions,
    Removals,
    Connected,
    Disconnected,
    NoDeviceSelected,
    EmptyTopology,
}

#[derive(Debug, Clone)]
pub struct Translator {
    locale: Locale,
}

impl Translator {
    pub fn new(locale: Locale) -> Self {
        Self { locale }
    }

    pub fn detected() -> Self {
        Self::new(Locale::detect())
    }

    pub fn locale(&self) -> Locale {
        self.locale
    }

    pub fn text(&self, message: Message) -> &'static str {
        match self.locale {
            Locale::En => english(message),
            Locale::ZhHans => chinese_simplified(message),
        }
    }
}

fn english(message: Message) -> &'static str {
    match message {
        Message::AppTitle => "rusbview",
        Message::Refresh => "Refresh",
        Message::Theme => "Theme",
        Message::Light => "Light",
        Message::Dark => "Dark",
        Message::System => "System",
        Message::Devices => "Devices",
        Message::Details => "Details",
        Message::Descriptors => "Descriptors",
        Message::Logs => "Logs",
        Message::Settings => "Settings...",
        Message::UsbExplorer => "USB Explorer",
        Message::File => "File",
        Message::Edit => "Edit",
        Message::View => "View",
        Message::Window => "Window",
        Message::Help => "Help",
        Message::Insertions => "Insertions",
        Message::Removals => "Removals",
        Message::Connected => "Connected",
        Message::Disconnected => "Disconnected",
        Message::NoDeviceSelected => "Select a USB device",
        Message::EmptyTopology => "No USB devices found",
    }
}

fn chinese_simplified(message: Message) -> &'static str {
    match message {
        Message::AppTitle => "rusbview",
        Message::Refresh => "刷新",
        Message::Theme => "主题",
        Message::Light => "亮色",
        Message::Dark => "暗色",
        Message::System => "系统",
        Message::Devices => "设备",
        Message::Details => "详情",
        Message::Descriptors => "描述符",
        Message::Logs => "日志",
        Message::Settings => "设置...",
        Message::UsbExplorer => "USB 浏览",
        Message::File => "文件",
        Message::Edit => "编辑",
        Message::View => "视图",
        Message::Window => "窗口",
        Message::Help => "帮助",
        Message::Insertions => "插入次数",
        Message::Removals => "拔出次数",
        Message::Connected => "已连接",
        Message::Disconnected => "已断开",
        Message::NoDeviceSelected => "选择一个 USB 设备",
        Message::EmptyTopology => "未找到 USB 设备",
    }
}
