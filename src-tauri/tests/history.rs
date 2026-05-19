mod common;

use rusbview_lib::history::DeviceHistoryStore;
use tempfile::tempdir;

use common::{empty_snapshot, snapshot};

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
