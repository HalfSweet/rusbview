use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Local};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

use crate::usb::{diff_snapshots, DeviceIdentity, UsbSnapshot};

const QUALIFIER: &str = "dev";
const ORGANIZATION: &str = "rusbview";
const APPLICATION: &str = "rusbview";
const HISTORY_FILE: &str = "device-history.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeviceHistoryStore {
    pub devices: BTreeMap<String, DeviceHistory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceHistory {
    pub key: String,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
    pub serial: Option<String>,
    pub first_seen: DateTime<Local>,
    pub last_seen: DateTime<Local>,
    pub last_location: String,
    pub insertions: u64,
    pub removals: u64,
    pub active: bool,
}

impl DeviceHistoryStore {
    pub fn load_default() -> Result<Self> {
        Self::load_from_path(default_history_path()?)
    }

    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if !path.exists() {
            return Ok(Self::default());
        }

        let raw = fs::read_to_string(path)
            .with_context(|| format!("failed to read device history at {}", path.display()))?;
        serde_json::from_str(&raw)
            .with_context(|| format!("failed to parse device history at {}", path.display()))
    }

    pub fn save_default(&self) -> Result<()> {
        self.save_to_path(default_history_path()?)
    }

    pub fn save_to_path(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "failed to create device history directory {}",
                    parent.display()
                )
            })?;
        }

        let raw = serde_json::to_string_pretty(self).context("failed to encode device history")?;
        fs::write(path, raw)
            .with_context(|| format!("failed to write device history at {}", path.display()))
    }

    pub fn observe_baseline(&mut self, snapshot: &UsbSnapshot) {
        let now = Local::now();
        for device in snapshot.flattened_devices() {
            let history = self.ensure_device(&device.identity, now);
            history.last_seen = now;
            history.last_location = device.identity.location.clone();
            history.active = true;
        }
    }

    pub fn apply_transition(&mut self, previous: &UsbSnapshot, current: &UsbSnapshot) {
        let diff = diff_snapshots(previous, current);
        let now = Local::now();

        for identity in diff.connected {
            let history = self.ensure_device(&identity, now);
            history.last_seen = now;
            history.last_location = identity.location.clone();
            history.insertions += 1;
            history.active = true;
        }

        for identity in diff.disconnected {
            let history = self.ensure_device(&identity, now);
            history.last_seen = now;
            history.last_location = identity.location.clone();
            history.removals += 1;
            history.active = false;
        }
    }

    pub fn get(&self, identity: &DeviceIdentity) -> Option<&DeviceHistory> {
        self.devices.get(&identity.stable_key())
    }

    fn ensure_device(
        &mut self,
        identity: &DeviceIdentity,
        now: DateTime<Local>,
    ) -> &mut DeviceHistory {
        let key = identity.stable_key();
        self.devices.entry(key.clone()).or_insert(DeviceHistory {
            key,
            vendor_id: identity.vendor_id,
            product_id: identity.product_id,
            serial: identity.serial.clone(),
            first_seen: now,
            last_seen: now,
            last_location: identity.location.clone(),
            insertions: 0,
            removals: 0,
            active: false,
        })
    }
}

pub fn default_history_path() -> Result<PathBuf> {
    let project_dirs = ProjectDirs::from(QUALIFIER, ORGANIZATION, APPLICATION)
        .context("failed to resolve application data directory")?;
    Ok(project_dirs.data_dir().join(HISTORY_FILE))
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;
    use crate::usb::{UsbBus, UsbDevice};

    fn snapshot(serial: &str, location: &str) -> UsbSnapshot {
        let identity = DeviceIdentity {
            vendor_id: Some(0x1234),
            product_id: Some(0xabcd),
            serial: Some(serial.to_string()),
            location: location.to_string(),
        };

        UsbSnapshot {
            scanned_at: Local::now(),
            device_count: 1,
            buses: vec![UsbBus {
                key: "bus-001".to_string(),
                name: "USB Bus 001".to_string(),
                controller: "USB Host Controller".to_string(),
                controller_vendor: None,
                controller_device: None,
                usb_bus_number: Some(1),
                devices: vec![UsbDevice {
                    instance_key: identity.instance_key(),
                    identity,
                    display_name: "Test Device".to_string(),
                    manufacturer: None,
                    vendor_name: "Vendor".to_string(),
                    product_name: "Device".to_string(),
                    bus_number: 1,
                    device_address: 2,
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
                }],
            }],
        }
    }

    fn empty_snapshot() -> UsbSnapshot {
        UsbSnapshot {
            scanned_at: Local::now(),
            buses: Vec::new(),
            device_count: 0,
        }
    }

    #[test]
    fn baseline_does_not_count_existing_devices_as_insertions() {
        let mut store = DeviceHistoryStore::default();
        let snapshot = snapshot("abc", "1-2");
        store.observe_baseline(&snapshot);

        let history = store
            .get(&snapshot.flattened_devices()[0].identity)
            .unwrap();
        assert_eq!(history.insertions, 0);
        assert_eq!(history.removals, 0);
        assert!(history.active);
    }

    #[test]
    fn transition_counts_insertions_and_removals() {
        let mut store = DeviceHistoryStore::default();
        let empty = empty_snapshot();
        let connected = snapshot("abc", "1-2");

        store.apply_transition(&empty, &connected);
        store.apply_transition(&connected, &empty);

        let identity = &connected.flattened_devices()[0].identity;
        let history = store.get(identity).unwrap();
        assert_eq!(history.insertions, 1);
        assert_eq!(history.removals, 1);
        assert!(!history.active);
    }

    #[test]
    fn persists_history_to_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("history.json");
        let mut store = DeviceHistoryStore::default();
        let snapshot = snapshot("abc", "1-2");
        store.apply_transition(&empty_snapshot(), &snapshot);
        store.save_to_path(&path).unwrap();

        let loaded = DeviceHistoryStore::load_from_path(&path).unwrap();
        let history = loaded
            .get(&snapshot.flattened_devices()[0].identity)
            .unwrap();
        assert_eq!(history.insertions, 1);
    }
}
