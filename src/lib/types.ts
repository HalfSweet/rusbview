export type BackendLocale = "En" | "ZhHans";
export type LanguageCode = "en" | "zh-CN";

export type UsbStatePayload = {
  snapshot: UsbSnapshot | null;
  history: DeviceHistoryStore;
  status: string;
  historyPath: string;
  logDir: string;
  locale: BackendLocale;
};

export type UsbMonitorPayload = {
  reason: string;
  connected: number;
  disconnected: number;
  state: UsbStatePayload;
};

export type UsbSnapshot = {
  scanned_at: string;
  buses: UsbBus[];
  device_count: number;
};

export type UsbBus = {
  key: string;
  name: string;
  controller: string;
  controller_vendor: string | null;
  controller_device: string | null;
  usb_bus_number: number | null;
  devices: UsbDevice[];
};

export type DeviceIdentity = {
  vendor_id: number | null;
  product_id: number | null;
  serial: string | null;
  location: string;
};

export type UsbDevice = {
  identity: DeviceIdentity;
  instance_key: string;
  display_name: string;
  manufacturer: string | null;
  vendor_name: string;
  product_name: string;
  bus_number: number;
  device_address: number;
  port_path: string;
  class: string | null;
  sub_class: number | null;
  protocol: number | null;
  device_speed: string | null;
  negotiated_speed: string | null;
  is_hub: boolean;
  last_event: string | null;
  profiler_error: string | null;
  descriptor_sections: DescriptorSection[];
  children: UsbDevice[];
};

export type DescriptorSection = {
  title: string;
  fields: DescriptorField[];
  children: DescriptorSection[];
};

export type DescriptorField = {
  name: string;
  value: string;
};

export type DeviceHistoryStore = {
  devices: Record<string, DeviceHistory>;
};

export type DeviceHistory = {
  key: string;
  vendor_id: number | null;
  product_id: number | null;
  serial: string | null;
  first_seen: string;
  last_seen: string;
  last_location: string;
  insertions: number;
  removals: number;
  active: boolean;
};
