import type { Locale } from "@/lib/types";

const messages = {
  En: {
    appTitle: "rusbview",
    appSubtitle: "USB topology, descriptors, and hotplug history",
    devices: "Devices",
    details: "Details",
    descriptors: "Descriptors",
    activity: "Activity",
    refresh: "Refresh",
    search: "Filter devices",
    noDevice: "Select a USB device",
    emptyTopology: "No USB devices found",
    overview: "Overview",
    logs: "Logs",
    connected: "Connected",
    disconnected: "Disconnected",
    insertions: "Insertions",
    removals: "Removals",
    bus: "Bus",
    device: "Device",
    path: "Path",
    serial: "Serial",
    manufacturer: "Manufacturer",
    class: "Class",
    subclass: "Subclass",
    protocol: "Protocol",
    speed: "Speed",
    negotiated: "Negotiated",
    lastEvent: "Last event",
    historyPath: "History file",
    logDir: "Log directory",
    status: "Status",
    system: "System",
    light: "Light",
    dark: "Dark",
    theme: "Theme",
    loading: "Loading USB snapshot",
    profilerError: "Profiler error",
  },
  ZhHans: {
    appTitle: "rusbview",
    appSubtitle: "USB 拓扑、描述符与热拔插历史",
    devices: "设备",
    details: "详情",
    descriptors: "描述符",
    activity: "活动",
    refresh: "刷新",
    search: "筛选设备",
    noDevice: "选择一个 USB 设备",
    emptyTopology: "未找到 USB 设备",
    overview: "概览",
    logs: "日志",
    connected: "已连接",
    disconnected: "已断开",
    insertions: "插入次数",
    removals: "拔出次数",
    bus: "总线",
    device: "设备",
    path: "路径",
    serial: "序列号",
    manufacturer: "制造商",
    class: "类别",
    subclass: "子类",
    protocol: "协议",
    speed: "速率",
    negotiated: "协商速率",
    lastEvent: "最近事件",
    historyPath: "历史文件",
    logDir: "日志目录",
    status: "状态",
    system: "系统",
    light: "亮色",
    dark: "暗色",
    theme: "主题",
    loading: "正在读取 USB 快照",
    profilerError: "枚举错误",
  },
} as const;

export type MessageKey = keyof (typeof messages)["En"];

export function resolveLocale(locale?: Locale): Locale {
  if (locale) {
    return locale;
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "ZhHans" : "En";
}

export function createTranslator(locale: Locale) {
  const table = messages[locale];
  return (key: MessageKey) => table[key] ?? messages.En[key];
}
