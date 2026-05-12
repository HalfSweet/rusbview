#[cfg(feature = "gui")]
fn main() {
    rusbview::gui::run();
}

#[cfg(not(feature = "gui"))]
fn main() {
    println!("rusbview was built without the gui feature. Run with: cargo run --features gui");
}
