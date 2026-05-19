mod common;

use chrono::Local;
use cyme::profiler::{DeviceEvent, ProfileDepth};
use rusbview_lib::usb::{diff_snapshots, profiler_options, snapshot_from_profile};

use common::{cyme_device, profile_with_devices, snapshot_with_devices, usb_device};

#[test]
fn serial_identity_is_location_independent() {
    let first = usb_device(Some("abc"), 2);
    let second = usb_device(Some("abc"), 3);

    assert_eq!(first.identity.stable_key(), second.identity.stable_key());
    assert_ne!(
        first.identity.instance_key(),
        second.identity.instance_key()
    );
}

#[test]
fn diff_reports_connected_and_disconnected_devices() {
    let previous = snapshot_with_devices(vec![usb_device(Some("old"), 2)]);
    let current = snapshot_with_devices(vec![usb_device(Some("new"), 3)]);
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

#[test]
fn snapshot_omits_devices_marked_disconnected_by_hotplug_stream() {
    let connected = cyme_device("Connected", 2, vec![2]);
    let mut disconnected = cyme_device("Disconnected", 3, vec![3]);
    disconnected.last_event = Some(DeviceEvent::Disconnected(Local::now()));

    let snapshot = snapshot_from_profile(&profile_with_devices(vec![connected, disconnected]));

    assert_eq!(snapshot.device_count, 1);
    assert_eq!(snapshot.buses[0].devices[0].display_name, "Connected");
}

#[test]
fn snapshot_omits_disconnected_children_from_hotplug_stream() {
    let mut hub = cyme_device("Hub", 2, vec![2]);
    let mut child = cyme_device("Disconnected Child", 4, vec![2, 1]);
    child.last_event = Some(DeviceEvent::Disconnected(Local::now()));
    hub.devices = Some(vec![child]);

    let snapshot = snapshot_from_profile(&profile_with_devices(vec![hub]));

    assert_eq!(snapshot.device_count, 1);
    assert_eq!(snapshot.buses[0].devices[0].children.len(), 0);
}
