use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Context, Result};
use chrono::{DateTime, Local};
use cyme::profiler::{self, Bus, Device, ProfileDepth, ProfilerOptions, SystemProfile};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsbSnapshot {
    pub scanned_at: DateTime<Local>,
    pub buses: Vec<UsbBus>,
    pub device_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsbBus {
    pub key: String,
    pub name: String,
    pub controller: String,
    pub controller_vendor: Option<String>,
    pub controller_device: Option<String>,
    pub usb_bus_number: Option<u8>,
    pub devices: Vec<UsbDevice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct DeviceIdentity {
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
    pub serial: Option<String>,
    pub location: String,
}

impl DeviceIdentity {
    pub fn stable_key(&self) -> String {
        match (&self.vendor_id, &self.product_id, &self.serial) {
            (Some(vid), Some(pid), Some(serial)) if !serial.is_empty() => {
                format!("{vid:04x}:{pid:04x}:{serial}")
            }
            (Some(vid), Some(pid), _) => format!("{vid:04x}:{pid:04x}@{}", self.location),
            _ => self.location.clone(),
        }
    }

    pub fn instance_key(&self) -> String {
        format!("{}#{}", self.stable_key(), self.location)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsbDevice {
    pub identity: DeviceIdentity,
    pub instance_key: String,
    pub display_name: String,
    pub manufacturer: Option<String>,
    pub vendor_name: String,
    pub product_name: String,
    pub bus_number: u8,
    pub device_address: u8,
    pub port_path: String,
    pub class: Option<String>,
    pub sub_class: Option<u8>,
    pub protocol: Option<u8>,
    pub device_speed: Option<String>,
    pub negotiated_speed: Option<String>,
    pub is_hub: bool,
    pub last_event: Option<String>,
    pub profiler_error: Option<String>,
    pub descriptor_sections: Vec<DescriptorSection>,
    pub children: Vec<UsbDevice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DescriptorSection {
    pub title: String,
    pub fields: Vec<DescriptorField>,
    pub children: Vec<DescriptorSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DescriptorField {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SnapshotDiff {
    pub connected: Vec<DeviceIdentity>,
    pub disconnected: Vec<DeviceIdentity>,
}

pub fn capture_snapshot() -> Result<UsbSnapshot> {
    let profile = profiler::get_spusb_with_options(&profiler_options())
        .context("failed to profile USB devices with cyme")?;
    Ok(snapshot_from_profile(&profile))
}

fn profiler_options() -> ProfilerOptions {
    ProfilerOptions {
        depth: ProfileDepth::Standard,
        tree: true,
        ..Default::default()
    }
}

pub fn snapshot_from_profile(profile: &SystemProfile) -> UsbSnapshot {
    let buses = profile.buses.iter().map(bus_from_cyme).collect::<Vec<_>>();
    let device_count = buses.iter().map(count_bus_devices).sum();

    UsbSnapshot {
        scanned_at: Local::now(),
        buses,
        device_count,
    }
}

pub fn diff_snapshots(previous: &UsbSnapshot, current: &UsbSnapshot) -> SnapshotDiff {
    let previous_map = previous.identity_map();
    let current_map = current.identity_map();
    let previous_keys = previous_map.keys().cloned().collect::<BTreeSet<_>>();
    let current_keys = current_map.keys().cloned().collect::<BTreeSet<_>>();

    SnapshotDiff {
        connected: current_keys
            .difference(&previous_keys)
            .filter_map(|key| current_map.get(key).cloned())
            .collect(),
        disconnected: previous_keys
            .difference(&current_keys)
            .filter_map(|key| previous_map.get(key).cloned())
            .collect(),
    }
}

impl UsbSnapshot {
    pub fn flattened_devices(&self) -> Vec<&UsbDevice> {
        let mut devices = Vec::new();
        for bus in &self.buses {
            for device in &bus.devices {
                collect_devices(device, &mut devices);
            }
        }
        devices
    }

    pub fn find_device(&self, instance_key: &str) -> Option<&UsbDevice> {
        self.flattened_devices()
            .into_iter()
            .find(|device| device.instance_key == instance_key)
    }

    fn identity_map(&self) -> BTreeMap<String, DeviceIdentity> {
        self.flattened_devices()
            .into_iter()
            .map(|device| (device.identity.instance_key(), device.identity.clone()))
            .collect()
    }
}

fn bus_from_cyme(bus: &Bus) -> UsbBus {
    let bus_number = bus.get_bus_number();
    UsbBus {
        key: bus_number
            .map(|number| format!("bus-{number:03}"))
            .unwrap_or_else(|| bus.name.clone()),
        name: bus.name.clone(),
        controller: bus.host_controller.clone(),
        controller_vendor: bus.host_controller_vendor.clone(),
        controller_device: bus.host_controller_device.clone(),
        usb_bus_number: bus_number,
        devices: bus
            .devices
            .as_ref()
            .map(|devices| devices.iter().map(device_from_cyme).collect())
            .unwrap_or_default(),
    }
}

fn device_from_cyme(device: &Device) -> UsbDevice {
    let location = device.port_path().to_string();
    let identity = DeviceIdentity {
        vendor_id: device.vendor_id,
        product_id: device.product_id,
        serial: device.serial_num.clone(),
        location: location.clone(),
    };
    let (vendor_name, product_name) = device.get_vendor_product_with_fallback();
    let descriptor_sections = descriptor_sections(device);
    let negotiated_speed = device
        .extra
        .as_ref()
        .and_then(|extra| extra.negotiated_speed.as_ref())
        .map(|speed| format!("{speed}"));

    UsbDevice {
        instance_key: identity.instance_key(),
        display_name: product_name
            .is_empty()
            .then(|| device.name.trim().to_owned())
            .unwrap_or_else(|| product_name.clone()),
        manufacturer: device.manufacturer.clone(),
        vendor_name,
        product_name,
        bus_number: device.location_id.bus,
        device_address: device.location_id.number,
        port_path: location,
        class: device.class.as_ref().map(|class| format!("{class:?}")),
        sub_class: device.sub_class,
        protocol: device.protocol,
        device_speed: device.device_speed.as_ref().map(|speed| format!("{speed}")),
        negotiated_speed,
        is_hub: device.is_hub(),
        last_event: device.last_event.as_ref().map(|event| format!("{event}")),
        profiler_error: device.profiler_error.clone(),
        descriptor_sections,
        children: device
            .devices
            .as_ref()
            .map(|children| children.iter().map(device_from_cyme).collect())
            .unwrap_or_default(),
        identity,
    }
}

fn descriptor_sections(device: &Device) -> Vec<DescriptorSection> {
    let mut sections = vec![DescriptorSection {
        title: "Device Descriptor".to_string(),
        fields: vec![
            field("USB Version", optional_display(&device.bcd_usb)),
            field("Device Version", optional_display(&device.bcd_device)),
            field("Class", optional_debug(&device.class)),
            field("Subclass", optional_hex_u8(device.sub_class)),
            field("Protocol", optional_hex_u8(device.protocol)),
            field("Vendor ID", optional_hex_u16(device.vendor_id)),
            field("Product ID", optional_hex_u16(device.product_id)),
            field("Manufacturer", optional_string(&device.manufacturer)),
            field("Product", device.name.trim()),
            field("Serial Number", optional_string(&device.serial_num)),
            field("Bus", format!("{:03}", device.location_id.bus)),
            field("Address", format!("{:03}", device.location_id.number)),
            field("Port Path", device.port_path().to_string()),
            field("Advertised Speed", optional_display(&device.device_speed)),
        ],
        children: Vec::new(),
    }];

    if let Some(extra) = &device.extra {
        let mut extra_section = DescriptorSection {
            title: "Extra Device Data".to_string(),
            fields: vec![
                field("Max Packet Size", extra.max_packet_size.to_string()),
                field("Driver", optional_string(&extra.driver)),
                field("System Path", optional_string(&extra.syspath)),
                field("Vendor Name", optional_string(&extra.vendor)),
                field("Product Name", optional_string(&extra.product_name)),
                field("String Indexes", format!("{:?}", extra.string_indexes)),
                field("Status", optional_hex_u16(extra.status)),
                field(
                    "Negotiated Speed",
                    optional_display(&extra.negotiated_speed),
                ),
                field(
                    "BOS Descriptor",
                    present(extra.binary_object_store.is_some()),
                ),
                field("Qualifier Descriptor", present(extra.qualifier.is_some())),
                field("Hub Descriptor", present(extra.hub.is_some())),
                field("Debug Descriptor", present(extra.debug.is_some())),
            ],
            children: Vec::new(),
        };

        for configuration in &extra.configurations {
            extra_section.children.push(DescriptorSection {
                title: format!("Configuration {}", configuration.number),
                fields: vec![
                    field("Name", configuration.name.as_str()),
                    field("Active", configuration.active.to_string()),
                    field(
                        "Interfaces",
                        configuration.number_of_interfaces().to_string(),
                    ),
                    field("Attributes", configuration.attributes_string()),
                    field(
                        "Attributes Value",
                        format!("0x{:02x}", configuration.attributes_value()),
                    ),
                    field("Max Power", configuration.max_power.to_string()),
                    field("Length", configuration.length.to_string()),
                    field("Total Length", configuration.total_length.to_string()),
                    field(
                        "Extra Descriptors",
                        configuration
                            .extra
                            .as_ref()
                            .map(|extra| extra.len().to_string())
                            .unwrap_or_else(|| "0".to_string()),
                    ),
                ],
                children: configuration
                    .interfaces
                    .iter()
                    .map(|interface| DescriptorSection {
                        title: format!(
                            "Interface {} alt {}",
                            interface.number, interface.alt_setting
                        ),
                        fields: vec![
                            field("Name", optional_string(&interface.name)),
                            field("Path", interface.path.as_str()),
                            field("Class", format!("{:?}", interface.class)),
                            field("Subclass", format!("0x{:02x}", interface.sub_class)),
                            field("Protocol", format!("0x{:02x}", interface.protocol)),
                            field("Active", interface.active.to_string()),
                            field("Driver", optional_string(&interface.driver)),
                            field("System Path", optional_string(&interface.syspath)),
                            field("Length", interface.length.to_string()),
                            field(
                                "Extra Descriptors",
                                interface
                                    .extra
                                    .as_ref()
                                    .map(|extra| extra.len().to_string())
                                    .unwrap_or_else(|| "0".to_string()),
                            ),
                        ],
                        children: interface
                            .endpoints
                            .iter()
                            .map(|endpoint| DescriptorSection {
                                title: format!("Endpoint 0x{:02x}", endpoint.address.address),
                                fields: vec![
                                    field("Length", endpoint.length.to_string()),
                                    field("Address", format!("{:?}", endpoint.address)),
                                    field("Transfer Type", format!("{:?}", endpoint.transfer_type)),
                                    field("Sync Type", format!("{:?}", endpoint.sync_type)),
                                    field("Usage Type", format!("{:?}", endpoint.usage_type)),
                                    field("Attributes", format!("0x{:02x}", endpoint.attributes())),
                                    field("Max Packet", endpoint.max_packet_string()),
                                    field("Interval", endpoint.interval.to_string()),
                                    field(
                                        "Extra Descriptors",
                                        endpoint
                                            .extra
                                            .as_ref()
                                            .map(|extra| extra.len().to_string())
                                            .unwrap_or_else(|| "0".to_string()),
                                    ),
                                ],
                                children: Vec::new(),
                            })
                            .collect(),
                    })
                    .collect(),
            });
        }

        sections.push(extra_section);
    }

    if let Ok(value) = serde_json::to_string_pretty(device) {
        sections.push(DescriptorSection {
            title: "Raw Cyme JSON".to_string(),
            fields: vec![field("JSON", value)],
            children: Vec::new(),
        });
    }

    sections
}

fn collect_devices<'a>(device: &'a UsbDevice, devices: &mut Vec<&'a UsbDevice>) {
    devices.push(device);
    for child in &device.children {
        collect_devices(child, devices);
    }
}

fn count_bus_devices(bus: &UsbBus) -> usize {
    bus.devices.iter().map(count_device).sum()
}

fn count_device(device: &UsbDevice) -> usize {
    1 + device.children.iter().map(count_device).sum::<usize>()
}

fn field(name: impl Into<String>, value: impl Into<String>) -> DescriptorField {
    DescriptorField {
        name: name.into(),
        value: value.into(),
    }
}

fn optional_string(value: &Option<String>) -> String {
    value.as_deref().unwrap_or("N/A").to_string()
}

fn optional_display<T: std::fmt::Display>(value: &Option<T>) -> String {
    value
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_else(|| "N/A".to_string())
}

fn optional_debug<T: std::fmt::Debug>(value: &Option<T>) -> String {
    value
        .as_ref()
        .map(|value| format!("{value:?}"))
        .unwrap_or_else(|| "N/A".to_string())
}

fn optional_hex_u8(value: Option<u8>) -> String {
    value
        .map(|value| format!("0x{value:02x}"))
        .unwrap_or_else(|| "N/A".to_string())
}

fn optional_hex_u16(value: Option<u16>) -> String {
    value
        .map(|value| format!("0x{value:04x}"))
        .unwrap_or_else(|| "N/A".to_string())
}

fn present(value: bool) -> String {
    if value {
        "Present".to_string()
    } else {
        "N/A".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot_with_devices(devices: Vec<UsbDevice>) -> UsbSnapshot {
        UsbSnapshot {
            scanned_at: Local::now(),
            device_count: devices.len(),
            buses: vec![UsbBus {
                key: "bus-001".to_string(),
                name: "USB Bus 001".to_string(),
                controller: "USB Host Controller".to_string(),
                controller_vendor: None,
                controller_device: None,
                usb_bus_number: Some(1),
                devices,
            }],
        }
    }

    fn test_device(serial: Option<&str>, address: u8) -> UsbDevice {
        let identity = DeviceIdentity {
            vendor_id: Some(0x1234),
            product_id: Some(0xabcd),
            serial: serial.map(str::to_string),
            location: format!("1-{address}"),
        };

        UsbDevice {
            instance_key: identity.instance_key(),
            identity,
            display_name: "Test Device".to_string(),
            manufacturer: Some("Test Vendor".to_string()),
            vendor_name: "Test Vendor".to_string(),
            product_name: "Test Device".to_string(),
            bus_number: 1,
            device_address: address,
            port_path: format!("1-{address}"),
            class: None,
            sub_class: None,
            protocol: None,
            device_speed: None,
            negotiated_speed: None,
            is_hub: false,
            last_event: None,
            profiler_error: None,
            descriptor_sections: Vec::new(),
            children: Vec::new(),
        }
    }

    #[test]
    fn serial_identity_is_location_independent() {
        let first = test_device(Some("abc"), 2);
        let second = test_device(Some("abc"), 3);

        assert_eq!(first.identity.stable_key(), second.identity.stable_key());
        assert_ne!(
            first.identity.instance_key(),
            second.identity.instance_key()
        );
    }

    #[test]
    fn diff_reports_connected_and_disconnected_devices() {
        let previous = snapshot_with_devices(vec![test_device(Some("old"), 2)]);
        let current = snapshot_with_devices(vec![test_device(Some("new"), 3)]);
        let diff = diff_snapshots(&previous, &current);

        assert_eq!(diff.connected.len(), 1);
        assert_eq!(diff.disconnected.len(), 1);
        assert_eq!(diff.connected[0].serial.as_deref(), Some("new"));
        assert_eq!(diff.disconnected[0].serial.as_deref(), Some("old"));
    }

    #[test]
    fn manual_capture_keeps_profile_tree() {
        let options = profiler_options();

        assert!(options.tree);
        assert_eq!(options.depth, ProfileDepth::Standard);
    }
}
