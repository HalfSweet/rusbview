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
        self.apply_diff(diff);
    }

    pub fn apply_diff(&mut self, diff: crate::usb::SnapshotDiff) {
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
