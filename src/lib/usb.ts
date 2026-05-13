import type {
  DeviceHistory,
  DeviceHistoryStore,
  UsbDevice,
  UsbSnapshot,
} from "@/lib/types";

export function flattenDevices(snapshot: UsbSnapshot) {
  const out: UsbDevice[] = [];
  snapshot.buses.forEach((bus) =>
    bus.devices.forEach((d) => collectDevices(d, out)),
  );
  return out;
}

function collectDevices(device: UsbDevice, out: UsbDevice[]) {
  out.push(device);
  device.children.forEach((c) => collectDevices(c, out));
}

export function collectExpandedKeys(snapshot: UsbSnapshot) {
  const keys = new Set<string>();
  snapshot.buses.forEach((bus) => {
    if (bus.devices.length > 0) keys.add(`bus:${bus.key}`);
    bus.devices.forEach((d) => collectDeviceExpansion(d, keys));
  });
  return keys;
}

function collectDeviceExpansion(device: UsbDevice, keys: Set<string>) {
  if (device.children.length > 0)
    keys.add(`device:${device.instance_key}`);
  device.children.forEach((c) => collectDeviceExpansion(c, keys));
}

export function filterDevice(
  device: UsbDevice,
  query: string,
): UsbDevice | null {
  if (!query) return device;
  const children = device.children
    .map((c) => filterDevice(c, query))
    .filter((c): c is UsbDevice => Boolean(c));
  if (children.length > 0 || deviceMatches(device, query))
    return { ...device, children };
  return null;
}

function deviceMatches(device: UsbDevice, query: string) {
  return [
    device.display_name,
    device.vendor_name,
    device.product_name,
    device.manufacturer,
    device.identity.serial,
    formatVidPid(device),
    device.port_path,
  ].some((v) => matchesText(v, query));
}

export function matchesText(
  value: string | null | undefined,
  query: string,
) {
  return Boolean(value?.toLowerCase().includes(query));
}

export function countDevices(devices: UsbDevice[]): number {
  return devices.reduce(
    (sum, d) => sum + 1 + countDevices(d.children),
    0,
  );
}

export function historyForDevice(
  history: DeviceHistoryStore,
  device: UsbDevice,
): DeviceHistory | undefined {
  return history.devices[stableKey(device)];
}

function stableKey(device: UsbDevice) {
  const { product_id: pid, serial, vendor_id: vid } = device.identity;
  if (vid !== null && pid !== null && serial)
    return `${hex(vid, 4)}:${hex(pid, 4)}:${serial}`;
  if (vid !== null && pid !== null)
    return `${hex(vid, 4)}:${hex(pid, 4)}@${device.identity.location}`;
  return device.identity.location;
}

export function formatVidPid(device: UsbDevice) {
  return `${hex(device.identity.vendor_id, 4)}:${hex(device.identity.product_id, 4)}`;
}

export function formatHex(value: number | null | undefined, width: number) {
  return value === null || value === undefined
    ? null
    : `0x${hex(value, width)}`;
}

function hex(value: number | null | undefined, width: number) {
  return value === null || value === undefined
    ? "-".repeat(width)
    : value.toString(16).padStart(width, "0");
}

export function pad3(value: number) {
  return value.toString().padStart(3, "0");
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function compact(values: Array<string | null | undefined>) {
  return values.filter((v): v is string => Boolean(v));
}
