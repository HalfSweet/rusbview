# AGENTS.md

本文件记录 `rusbview` 项目的协作共识。后续 agent 在本仓库工作时，应优先遵守这里的约定，并结合现有代码风格做最小、清晰、可验证的修改。

## 项目定位

`rusbview` 是一个 Tauri 桌面应用，目标是提供一个 GUI USB 枚举查看工具。它用于查看 USB 总线拓扑、设备详情、热插拔历史和描述符信息。

核心原则：

- USB 拓扑树是产品的核心信息结构，任何刷新、过滤、选择或热插拔逻辑都不能破坏 parent/child 关系。
- UI 是工具型桌面应用，不是营销页。优先清晰、克制、稳定、可扫描。
- 变更要小步提交，便于回滚和审查。

## 技术栈

- 桌面框架：Tauri 2
- 前端：React 19、TypeScript、Vite
- UI：shadcn/ui、Radix、Tailwind CSS
- 图标：优先使用 `lucide-react`
- 动画：`motion`
- 国际化：`i18next`、`react-i18next`
- 后端：Rust 2021
- USB 数据：`cyme`，热插拔监听基于 `cyme`/`nusb`

## 目录约定

- `src/App.tsx`：应用主状态、页面切换、Tauri 命令和事件入口。
- `src/components/`：业务组件。
- `src/components/ui/`：shadcn/ui 风格的基础组件。
- `src/lib/types.ts`：前后端共享的数据类型定义。
- `src/lib/usb.ts`：USB 前端数据处理工具。
- `src/locales/`：前端 i18n 文案。
- `src-tauri/src/usb.rs`：USB 快照、设备转换、diff 和描述符模型。
- `src-tauri/src/monitor.rs`：热插拔监听。
- `src-tauri/src/history.rs`：设备历史统计。
- `src-tauri/src/i18n.rs`：后端语言检测和文案。

## UI 与交互

UI 需要具体、现代、简洁、优雅但克制。

- 使用 shadcn/ui 和现有设计 token，避免硬编码不必要的颜色。
- 必须兼顾浅色、深色和 system 主题。
- 用户可见文案必须走 i18n，不要把中文或英文硬编码在组件里。
- 动画使用 `motion`，保持短促、低干扰；注意 reduced motion。
- 桌面工具界面应偏信息密度和扫描效率，避免过大的 hero、装饰性卡片和无意义渐变。
- 使用 `lucide-react` 图标表达工具动作；按钮、tab、badge、toolbar 等优先沿用现有组件风格。
- 不要让文本、badge、长设备名或 VID/PID 信息在窄侧边栏中互相覆盖。必要时使用 `truncate`、固定尺寸和响应式约束。

## USB 数据与状态

- 手动刷新和热插拔刷新必须返回一致的树形拓扑。
- 使用 `cyme` 采集时要确认 `ProfilerOptions.tree` 符合调用场景；树视图依赖 `children`。
- `instance_key` 用于当前快照中的节点选择和渲染 key，稳定身份统计应使用 `DeviceIdentity::stable_key()` 语义。
- 过滤设备时应保留匹配子节点的祖先路径，不能把命中的子设备提升成根节点。
- 历史统计、日志、刷新状态和错误提示都应允许部分失败；单个设备描述符读取失败不应导致整个快照不可用。

## i18n

- 新增用户可见文本时，同时更新 `src/locales/en/translation.json` 和 `src/locales/zh-CN/translation.json`。
- 后端状态或错误如果面向用户展示，也要考虑 `src-tauri/src/i18n.rs`。
- 不要用字符串拼接生成难翻译的句子；优先使用带变量的翻译 key。

## 代码风格

- 前端保持函数组件、明确 props 类型和小工具函数。
- 派生数据优先用 `useMemo` 或纯函数，避免用 effect 维护可同步计算的状态。
- 事件处理和状态更新保持局部、可读；不要引入全局状态库，除非现有复杂度已经需要。
- Rust 代码优先使用结构化类型和 `Result`，错误上下文用 `anyhow::Context`。
- 日志使用 `tracing`，不要用 `println!` 调试留在正式代码中。
- 修改前先看现有实现，优先复用本仓库已有模式。

## 验证

按变更范围选择验证命令，并在最终回复中说明结果。

- 前端类型检查：`pnpm exec tsc --noEmit`
- 前端构建：`pnpm build`
- Rust 测试：`cargo test`
- 格式化 Rust：`cargo fmt`
- Tauri 运行验证：`pnpm tauri dev`

如果只改文档，可不跑完整构建，但仍应检查 `git diff` 和工作区状态。

## 提交纪律

- 每次完成一个细粒度修改后，都应使用约定式提交进行 `git commit`。
- 提交信息使用 Conventional Commits，例如：
  - `fix: preserve USB tree on manual refresh`
  - `feat: add descriptor log filtering`
  - `docs: add agent collaboration guide`
  - `refactor: simplify USB snapshot mapping`
  - `test: cover device history transitions`
- 一次提交只包含一个清晰主题，不要混入无关格式化、实验代码或生成物。
- 提交前检查 `git status --short`，确认没有意外文件。
- 不要回滚用户未要求回滚的改动；如果工作区已有无关改动，避开它们。

## 回复习惯

- 说明做了什么、验证了什么、是否有剩余风险。
- 对失败的命令给出具体原因和下一步，而不是笼统说失败。
- 文件引用尽量给出具体路径，便于用户快速打开。
