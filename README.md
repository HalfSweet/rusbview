# rusbview

`rusbview` is a Tauri desktop application for inspecting USB topology, device details, hotplug history, and USB descriptors. USB enumeration and hotplug watching are provided by `cyme`; the frontend is React, shadcn/ui, Tailwind CSS, and Motion.

## Run

Install frontend dependencies with `pnpm`:

```sh
pnpm install
```

Start the Tauri desktop app:

```sh
pnpm tauri dev
```

Build distribution bundles:

```sh
pnpm tauri build
```

For development and CI checks:

```sh
pnpm build
cargo test
```

## Platform Notes

### macOS

- Requires the Xcode command line toolchain.
- USB descriptor access can be limited by macOS permissions and device class restrictions. The app keeps profiling errors in the device detail model instead of failing the whole snapshot.

### Linux

- Tauri needs the WebKitGTK and desktop integration packages for the target distribution.
- Full descriptor reads may require udev permissions for USB devices. If devices appear without verbose descriptors, add appropriate udev rules or run with elevated permissions for debugging.

### Windows

- Build with the stable MSVC Rust toolchain and the WebView2 runtime available on the target machine.
- Some descriptor or hotplug metadata may depend on Windows device access permissions. Running elevated can help distinguish permission issues from parser issues.

## Data Locations

The application uses OS-specific project directories via the `directories` crate:

- Device history: `device-history.json` under the application data directory.
- Logs: daily rolling files under the application cache directory.

The GUI displays both paths in the Logs tab. Logs use `RUST_LOG` when set, otherwise `info`.

## Features

- Tree view of USB buses and devices.
- Device details with vendor/product IDs, serial number, speed, class, protocol, and location.
- Descriptor sections generated from cyme's verbose USB data, including configurations, interfaces, endpoints, BOS, qualifier, hub, and raw cyme JSON.
- Hotplug listener based on cyme/nusb watch support, pushed to the UI with Tauri events.
- Persistent insertion/removal counters keyed by stable device identity.
- Light, dark, and system theme modes.
- Initial i18n structure for English and Simplified Chinese. Use `RUSBVIEW_LANG=zh` to force the backend locale during development.
