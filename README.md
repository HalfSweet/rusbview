# rusbview

`rusbview` is a GPUI desktop application for inspecting USB topology, device details, hotplug history, and USB descriptors. USB enumeration is provided by `cyme`.

## Run

```sh
cargo run
```

For development and CI checks:

```sh
cargo test
cargo check
```

## Platform Notes

### macOS

- Requires the Xcode command line toolchain and the Metal Toolchain. If GPUI fails to compile shaders, run:

```sh
xcodebuild -downloadComponent MetalToolchain
```

- USB descriptor access can be limited by macOS permissions and device class restrictions. The app keeps profiling errors in the device detail model instead of failing the whole snapshot.

### Linux

- GPUI needs a working desktop graphics stack. Distribution packages usually include Wayland/X11, fontconfig, OpenGL/EGL, and xkbcommon development libraries.
- Full descriptor reads may require udev permissions for USB devices. If devices appear without verbose descriptors, add appropriate udev rules or run with elevated permissions for debugging.

### Windows

- GPUI uses the Windows platform backend. Build with the stable MSVC Rust toolchain.
- Some descriptor or hotplug metadata may depend on Windows device access permissions. Running elevated can help distinguish permission issues from parser issues.

## Data Locations

The application uses OS-specific project directories via the `directories` crate:

- Device history: `device-history.json` under the application data directory.
- Logs: daily rolling files under the application cache directory.

The GUI displays the history file path in the details header. Logs use `RUST_LOG` when set, otherwise `info`.

## Features

- Tree view of USB buses and devices.
- Device details with vendor/product IDs, serial number, speed, class, protocol, and location.
- Descriptor sections generated from cyme's verbose USB data, including configurations, interfaces, endpoints, BOS, qualifier, hub, and raw cyme JSON.
- Hotplug listener based on cyme/nusb watch support.
- Persistent insertion/removal counters keyed by stable device identity.
- Light, dark, and system theme modes.
- Initial i18n message catalog with English and Simplified Chinese. Use `RUSBVIEW_LANG=zh` to force Chinese text.
