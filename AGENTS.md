# AGENTS.md

This file captures the shared working conventions for `rusbview`. Future agents working in this repository should follow these rules first, while still matching the existing code style and keeping changes small, clear, and verifiable.

## Project Purpose

`rusbview` is a Tauri desktop application for browsing USB enumeration data through a GUI. It shows USB bus topology, device details, hotplug history, and descriptor information.

Core principles:

- The UI is a desktop tool, not a marketing page. Keep it clear, restrained, stable, and easy to scan.
- Work in small commits so changes are easy to review, revert, and reason about.

## Tech Stack

- Desktop framework: Tauri
- Frontend: React 19, TypeScript, Vite
- UI: shadcn/ui, Radix, Tailwind CSS
- Icons: prefer `lucide-react`
- Animation: `motion`

## Directory Conventions

- `src/App.tsx`: app-level state, page switching, Tauri commands, and event wiring.
- `src/components/`: product-specific components.
- `src/components/ui/`: shadcn/ui-style primitives.
- `src/lib/types.ts`: shared frontend/backend data types.
- `src/lib/usb.ts`: frontend USB data helpers.
- `src/locales/`: frontend i18n messages.
- `src-tauri/src/usb.rs`: USB snapshots, device mapping, diffs, and descriptor models.
- `src-tauri/src/monitor.rs`: hotplug monitoring.
- `src-tauri/src/history.rs`: device history tracking.
- `src-tauri/src/i18n.rs`: backend locale detection and messages.

## UI And Interaction

The UI should feel specific, modern, simple, elegant, and restrained.

- Use shadcn/ui and the existing design tokens. Avoid unnecessary hardcoded colors.
- Always account for light, dark, and system theme modes.
- User-facing text must go through i18n. Do not hardcode Chinese or English strings in components.
- Use `motion` for animation. Keep transitions short and low-distraction, and respect reduced motion.
- This is an information-dense desktop tool. Prefer scanning efficiency over large hero sections, decorative cards, or meaningless gradients.
- Use `lucide-react` icons for tool actions. Buttons, tabs, badges, toolbars, and related controls should follow existing component patterns.
- Prevent text, badges, long device names, and VID/PID values from overlapping in narrow sidebars. Use `truncate`, stable dimensions, and responsive constraints where needed.

## USB Data And State

- Manual refresh and hotplug refresh must return the same tree-shaped topology.
- When collecting data through `cyme`, make sure `ProfilerOptions.tree` matches the call site. The tree view depends on `children`.
- `instance_key` is for selection and React rendering keys within the current snapshot. Stable identity tracking should follow `DeviceIdentity::stable_key()` semantics.
- Filtering must preserve ancestor paths for matched child devices. Do not promote matched children into root nodes.
- History, logging, refresh state, and error reporting should tolerate partial failures. A descriptor read failure for one device should not make the entire snapshot unusable.

## i18n

- When adding user-facing text, update both `src/locales/en/translation.json` and `src/locales/zh-CN/translation.json`.
- If backend status or error text is shown to users, also consider `src-tauri/src/i18n.rs`.
- Avoid building translatable sentences through ad hoc string concatenation. Prefer translation keys with variables.

## Code Style

- Frontend code should use function components, explicit prop types, and small helper functions.
- Prefer pure functions or `useMemo` for derived data. Avoid effects that only mirror synchronously computable state.
- Keep event handling and state updates local and readable. Do not add a global state library unless the existing complexity clearly requires it.
- Rust code should use structured types and `Result`; add error context with `anyhow::Context`.
- Use `tracing` for logs. Do not leave `println!` debugging in production code.
- Read the existing implementation before changing it, and reuse local patterns first.

## Verification

Choose validation commands based on the change scope, and report what ran in the final response.

- Frontend type check: `pnpm exec tsc --noEmit`
- Frontend build: `pnpm build`
- Rust tests: `cargo test`
- Rust formatting: `cargo fmt`
- Tauri runtime check: `pnpm tauri dev`

For documentation-only changes, a full build is not required, but still check `git diff` and the working tree state.

## Commit Discipline

- After each fine-grained change, create a git commit using Conventional Commits.
- Example commit messages:
  - `fix: preserve USB tree on manual refresh`
  - `feat: add descriptor log filtering`
  - `docs: add agent collaboration guide`
  - `refactor: simplify USB snapshot mapping`
  - `test: cover device history transitions`
- Each commit should contain one clear topic. Do not mix unrelated formatting, experiments, or generated files.
- Check `git status --short` before committing to avoid accidental files.
- Do not revert user changes unless explicitly asked. If unrelated work is already present in the working tree, avoid touching it.
