use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use anyhow::{anyhow, Context, Result};
use cyme::profiler::watch::SystemProfileStreamBuilder;
use futures_lite::{future, StreamExt};
use tracing::{debug, error, info};

use crate::usb::{diff_snapshots, snapshot_from_profile, SnapshotDiff, UsbSnapshot};

#[derive(Debug, Clone)]
pub enum MonitorEvent {
    Baseline(UsbSnapshot),
    Changed {
        snapshot: UsbSnapshot,
        diff: SnapshotDiff,
    },
    Error(String),
}

#[derive(Debug)]
pub struct UsbMonitorHandle {
    stop: Arc<AtomicBool>,
    _thread: JoinHandle<()>,
}

impl UsbMonitorHandle {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

impl Drop for UsbMonitorHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn spawn_hotplug_monitor() -> (UsbMonitorHandle, Receiver<MonitorEvent>) {
    let (tx, rx) = mpsc::channel();
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);

    let handle = thread::Builder::new()
        .name("rusbview-usb-monitor".to_string())
        .spawn(move || {
            if let Err(error) = run_monitor(tx.clone(), thread_stop) {
                error!(?error, "USB monitor stopped with error");
                let _ = tx.send(MonitorEvent::Error(error.to_string()));
            }
        })
        .expect("failed to spawn USB monitor thread");

    (
        UsbMonitorHandle {
            stop,
            _thread: handle,
        },
        rx,
    )
}

fn run_monitor(tx: Sender<MonitorEvent>, stop: Arc<AtomicBool>) -> Result<()> {
    let mut stream = SystemProfileStreamBuilder::new()
        .is_verbose(true)
        .build()
        .context("failed to start cyme USB hotplug stream")?;

    let initial_profile = stream.get_profile();
    let mut previous = {
        let profile = initial_profile
            .lock()
            .map_err(|_| anyhow!("failed to lock initial USB profile"))?;
        snapshot_from_profile(&profile)
    };

    tx.send(MonitorEvent::Baseline(previous.clone()))
        .context("failed to send initial USB snapshot")?;
    info!(
        device_count = previous.device_count,
        "USB hotplug monitor started"
    );

    future::block_on(async {
        while !stop.load(Ordering::SeqCst) {
            let Some(profile) = stream.next().await else {
                break;
            };

            let current = {
                let profile = profile
                    .lock()
                    .map_err(|_| anyhow!("failed to lock updated USB profile"))?;
                snapshot_from_profile(&profile)
            };
            let diff = diff_snapshots(&previous, &current);
            debug!(
                connected = diff.connected.len(),
                disconnected = diff.disconnected.len(),
                "USB topology changed"
            );

            if tx
                .send(MonitorEvent::Changed {
                    snapshot: current.clone(),
                    diff,
                })
                .is_err()
            {
                break;
            }

            previous = current;
        }

        Ok::<_, anyhow::Error>(())
    })?;

    info!("USB hotplug monitor stopped");
    Ok(())
}
