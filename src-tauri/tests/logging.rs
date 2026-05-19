use rusbview_lib::logging::default_log_dir;

#[test]
fn default_log_dir_ends_with_logs() {
    let path = default_log_dir().unwrap();
    assert_eq!(
        path.file_name().and_then(|name| name.to_str()),
        Some("logs")
    );
}
