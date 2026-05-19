#![allow(dead_code)]

use chrono::Local;
use cyme::profiler::{Bus, Device, DeviceLocation, SystemProfile};
use rusbview_lib::usb::{DeviceIdentity, UsbBus, UsbDevice, UsbSnapshot};

pub fn snapshot_with_devices(devices: Vec<UsbDevice>) -> UsbSnapshot {
    UsbSnapshot {
        scanned_at: Local::now(),
        device_count: devices.iter().map(count_device).sum(),
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

pub fn snapshot(serial: &str, location: &str) -> UsbSnapshot {
    snapshot_with_devices(vec![usb_device_at_location(Some(serial), location, 2)])
}

pub fn empty_snapshot() -> UsbSnapshot {
    UsbSnapshot {
        scanned_at: Local::now(),
        buses: Vec::new(),
        device_count: 0,
    }
}

pub fn usb_device(serial: Option<&str>, address: u8) -> UsbDevice {
    usb_device_at_location(serial, &format!("1-{address}"), address)
}

pub fn usb_device_at_location(serial: Option<&str>, location: &str, address: u8) -> UsbDevice {
    let identity = DeviceIdentity {
        vendor_id: Some(0x1234),
        product_id: Some(0xabcd),
        serial: serial.map(str::to_string),
        location: location.to_string(),
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
        port_path: location.to_string(),
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

pub fn cyme_device(name: &str, address: u8, positions: Vec<u8>) -> Device {
    Device {
        name: name.to_string(),
        vendor_id: Some(0x1234),
        product_id: Some(0xabcd),
        location_id: DeviceLocation {
            bus: 1,
            number: address,
            tree_positions: positions,
        },
        ..Default::default()
    }
}

pub fn profile_with_devices(devices: Vec<Device>) -> SystemProfile {
    let mut bus = Bus::from(1);
    bus.devices = Some(devices);

    SystemProfile { buses: vec![bus] }
}

fn count_device(device: &UsbDevice) -> usize {
    1 + device.children.iter().map(count_device).sum::<usize>()
}
