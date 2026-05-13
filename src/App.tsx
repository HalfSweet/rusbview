import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  FolderTree,
  HardDrive,
  type LucideIcon,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sun,
  Usb,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { backendLocaleToLanguage, supportedLanguages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  BackendLocale,
  DescriptorSection,
  DeviceHistory,
  DeviceHistoryStore,
  LanguageCode,
  UsbBus,
  UsbDevice,
  UsbMonitorPayload,
  UsbSnapshot,
  UsbStatePayload,
} from "@/lib/types";

type ThemeMode = "system" | "light" | "dark";
type PageMode = "devices" | "settings";
type Translator = TFunction<"translation", undefined>;

const EVENT_NAME = "usb-state-changed";

function App() {
  const [payload, setPayload] = useState<UsbStatePayload | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<PageMode>("devices");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("rusbview-theme");
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedTree = useRef(false);

  const { i18n, t } = useTranslation();
  const snapshot = payload?.snapshot ?? null;
  const history = payload?.history ?? { devices: {} };
  const devices = useMemo(
    () => (snapshot ? flattenDevices(snapshot) : []),
    [snapshot],
  );
  const selectedDevice = useMemo(
    () =>
      selectedKey
        ? devices.find((d) => d.instance_key === selectedKey) ?? null
        : null,
    [devices, selectedKey],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", isDark);
    };
    localStorage.setItem("rusbview-theme", theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    if (!payload?.locale || localStorage.getItem("i18nextLng")) return;
    void i18n.changeLanguage(backendLocaleToLanguage(payload.locale));
  }, [i18n, payload?.locale]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    invoke<UsbStatePayload>("get_usb_state")
      .then((state) => {
        if (!disposed) {
          setPayload(state);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!disposed) setError(String(reason));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    listen<UsbMonitorPayload>(EVENT_NAME, (event) => {
      setPayload(event.payload.state);
      setError(null);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    setSelectedKey((current) => {
      if (current && devices.some((d) => d.instance_key === current))
        return current;
      return devices[0]?.instance_key ?? null;
    });
  }, [devices, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const keys = collectExpandedKeys(snapshot);
    setExpanded((current) => {
      if (initializedTree.current) {
        const next = new Set(current);
        keys.forEach((k) => next.add(k));
        return next;
      }
      initializedTree.current = true;
      return keys;
    });
  }, [snapshot]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      const state = await invoke<UsbStatePayload>("refresh_usb_state");
      setPayload(state);
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setRefreshing(false);
    }
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
          {/* ─── Toolbar ─── */}
          <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3 select-none">
            <div className="flex items-center gap-2">
              <Usb className="size-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-tight">
                {t("appTitle")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {payload?.status ?? (loading ? "..." : "")}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <SegmentedControl
                items={[
                  {
                    key: "devices" as const,
                    label: t("pageDevices"),
                    icon: FolderTree,
                  },
                  {
                    key: "settings" as const,
                    label: t("settings"),
                    icon: SettingsIcon,
                  },
                ]}
                value={page}
                onChange={setPage}
              />

              <div className="mx-1 h-4 w-px bg-border" />

              <ThemeToggle theme={theme} setTheme={setTheme} t={t} />

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                    disabled={refreshing}
                    onClick={refreshNow}
                  >
                    <RefreshCw
                      className={cn(
                        "size-3",
                        refreshing && "animate-spin",
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("refresh")}</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {/* ─── Body ─── */}
          <main className="min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              {page === "settings" ? (
                <motion.div
                  key="settings"
                  className="h-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <SettingsPage
                    backendLocale={payload?.locale ?? null}
                    historyPath={payload?.historyPath ?? "—"}
                    language={i18n.resolvedLanguage ?? i18n.language}
                    logDir={payload?.logDir ?? "—"}
                    status={payload?.status ?? null}
                    t={t}
                    theme={theme}
                    setTheme={setTheme}
                    onLanguageChange={(lang) => void i18n.changeLanguage(lang)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="devices"
                  className="h-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <ResizablePanelGroup>
                    <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                      <TreeSidebar
                        expanded={expanded}
                        history={history}
                        loading={loading}
                        query={query}
                        selectedKey={selectedKey}
                        snapshot={snapshot}
                        t={t}
                        toggleExpanded={toggleExpanded}
                        onQueryChange={setQuery}
                        onSelect={setSelectedKey}
                      />
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={70} minSize={40}>
                      <DetailPane
                        device={selectedDevice}
                        error={error}
                        history={history}
                        logDir={payload?.logDir ?? "—"}
                        historyPath={payload?.historyPath ?? "—"}
                        snapshot={snapshot}
                        status={payload?.status ?? null}
                        t={t}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}

/* ═══════════════════════════════════════════════════════
   Toolbar controls
   ═══════════════════════════════════════════════════════ */

function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ key: T; label: string; icon: LucideIcon }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="relative flex h-6 items-center rounded-sm bg-muted p-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.key;
        return (
          <button
            key={item.key}
            className={cn(
              "relative z-10 flex h-5 items-center gap-1 rounded-[3px] px-1.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(item.key)}
          >
            <Icon className="size-3" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function ThemeToggle({
  theme,
  setTheme,
  t,
}: {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  t: Translator;
}) {
  const modes: Array<{ mode: ThemeMode; icon: LucideIcon; label: string }> = [
    { mode: "system", icon: Monitor, label: t("system") },
    { mode: "light", icon: Sun, label: t("light") },
    { mode: "dark", icon: Moon, label: t("dark") },
  ];

  return (
    <div className="flex h-6 items-center rounded-sm bg-muted p-0.5">
      {modes.map((item) => {
        const Icon = item.icon;
        const active = theme === item.mode;
        return (
          <Tooltip key={item.mode}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "flex size-5 items-center justify-center rounded-[3px] transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setTheme(item.mode)}
              >
                <Icon className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Tree Sidebar
   ═══════════════════════════════════════════════════════ */

function TreeSidebar({
  expanded,
  history,
  loading,
  query,
  selectedKey,
  snapshot,
  t,
  toggleExpanded,
  onQueryChange,
  onSelect,
}: {
  expanded: Set<string>;
  history: DeviceHistoryStore;
  loading: boolean;
  query: string;
  selectedKey: string | null;
  snapshot: UsbSnapshot | null;
  t: Translator;
  toggleExpanded: (key: string) => void;
  onQueryChange: (q: string) => void;
  onSelect: (key: string) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <aside className="flex h-full flex-col border-r border-border bg-sidebar">
      {/* search */}
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <Search className="size-3 shrink-0 text-muted-foreground" />
        <input
          className="h-full flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          placeholder={t("search")}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {query && (
          <button
            className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => onQueryChange("")}
          >
            <X className="size-2.5" />
          </button>
        )}
      </div>

      {/* tree header */}
      <div className="flex h-6 shrink-0 items-center justify-between px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>{t("devices")}</span>
        {snapshot && (
          <span className="tabular-nums">{snapshot.device_count}</span>
        )}
      </div>

      {/* tree body */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1 pb-2">
          {loading ? (
            <LoadingTree />
          ) : snapshot && snapshot.buses.length > 0 ? (
            snapshot.buses.map((bus) => (
              <BusNode
                bus={bus}
                expanded={expanded}
                history={history}
                key={bus.key}
                query={normalizedQuery}
                selectedKey={selectedKey}
                t={t}
                toggleExpanded={toggleExpanded}
                onSelect={onSelect}
              />
            ))
          ) : (
            <EmptyState icon={Cable} label={t("emptyTopology")} compact />
          )}
        </div>
      </ScrollArea>

      {/* status bar */}
      <div className="flex h-5 shrink-0 items-center border-t border-border px-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Activity className="size-2.5" />
          <span>{t("activity")}</span>
        </div>
      </div>
    </aside>
  );
}

function BusNode({
  bus,
  expanded,
  history,
  query,
  selectedKey,
  t,
  toggleExpanded,
  onSelect,
}: {
  bus: UsbBus;
  expanded: Set<string>;
  history: DeviceHistoryStore;
  query: string;
  selectedKey: string | null;
  t: Translator;
  toggleExpanded: (key: string) => void;
  onSelect: (key: string) => void;
}) {
  const visibleDevices = bus.devices
    .map((d) => filterDevice(d, query))
    .filter((d): d is UsbDevice => Boolean(d));
  const hasChildren = visibleDevices.length > 0;
  const treeKey = `bus:${bus.key}`;
  const isExpanded = query.length > 0 || expanded.has(treeKey);

  if (query && !hasChildren && !matchesText(bus.name, query)) return null;

  return (
    <div>
      <TreeItem
        depth={0}
        icon={Cable}
        isExpanded={isExpanded}
        hasChildren={hasChildren}
        label={bus.name}
        sublabel={`${bus.controller} · ${countDevices(bus.devices)} ${t("device").toLowerCase()}`}
        onClick={() => hasChildren && toggleExpanded(treeKey)}
        onToggle={() => toggleExpanded(treeKey)}
      />
      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="ml-[15px] tree-guide-line">
              {visibleDevices.map((device, idx) => (
                <DeviceNode
                  depth={1}
                  device={device}
                  expanded={expanded}
                  history={history}
                  isLast={idx === visibleDevices.length - 1}
                  key={device.instance_key}
                  query={query}
                  selectedKey={selectedKey}
                  t={t}
                  toggleExpanded={toggleExpanded}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DeviceNode({
  depth,
  device,
  expanded,
  history,
  isLast,
  query,
  selectedKey,
  t,
  toggleExpanded,
  onSelect,
}: {
  depth: number;
  device: UsbDevice;
  expanded: Set<string>;
  history: DeviceHistoryStore;
  isLast: boolean;
  query: string;
  selectedKey: string | null;
  t: Translator;
  toggleExpanded: (key: string) => void;
  onSelect: (key: string) => void;
}) {
  const treeKey = `device:${device.instance_key}`;
  const isExpanded = query.length > 0 || expanded.has(treeKey);
  const hasChildren = device.children.length > 0;
  const record = historyForDevice(history, device);
  const Icon = device.is_hub ? Usb : HardDrive;

  return (
    <div className={cn("tree-node", isLast && "tree-node-last")}>
      <TreeItem
        depth={0}
        icon={Icon}
        isExpanded={isExpanded}
        isSelected={selectedKey === device.instance_key}
        hasChildren={hasChildren}
        label={device.display_name}
        sublabel={formatVidPid(device)}
        badge={
          record ? (
            <span className="ml-auto flex shrink-0 gap-1 text-[10px] tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{record.insertions}
              </span>
              <span className="text-rose-500 dark:text-rose-400">
                -{record.removals}
              </span>
            </span>
          ) : null
        }
        onClick={() => onSelect(device.instance_key)}
        onToggle={() => toggleExpanded(treeKey)}
      />
      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="ml-[16px] tree-guide-line">
              {device.children.map((child, idx) => (
                <DeviceNode
                  depth={depth + 1}
                  device={child}
                  expanded={expanded}
                  history={history}
                  isLast={idx === device.children.length - 1}
                  key={child.instance_key}
                  query={query}
                  selectedKey={selectedKey}
                  t={t}
                  toggleExpanded={toggleExpanded}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TreeItem({
  depth,
  icon: Icon,
  isExpanded,
  isSelected,
  hasChildren,
  label,
  sublabel,
  badge,
  onClick,
  onToggle,
}: {
  depth: number;
  icon: LucideIcon;
  isExpanded: boolean;
  isSelected?: boolean;
  hasChildren: boolean;
  label: string;
  sublabel: string;
  badge?: ReactNode;
  onClick: () => void;
  onToggle: () => void;
}) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "group flex h-7 items-center gap-0.5 rounded-sm px-1 text-left transition-colors cursor-pointer",
        isSelected
          ? "bg-primary/10 text-foreground"
          : "text-foreground/80 hover:bg-accent",
      )}
      style={{ paddingLeft: 4 + depth * 16 }}
      onClick={onClick}
    >
      <button
        className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        tabIndex={-1}
      >
        {hasChildren && <Chevron className="size-3" />}
      </button>
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          isSelected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="ml-1 min-w-0 flex-1 truncate text-xs leading-tight">
        {label}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
        {sublabel}
      </span>
      {badge}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Detail Pane
   ═══════════════════════════════════════════════════════ */

function DetailPane({
  device,
  error,
  history,
  historyPath,
  logDir,
  snapshot,
  status,
  t,
}: {
  device: UsbDevice | null;
  error: string | null;
  history: DeviceHistoryStore;
  historyPath: string;
  logDir: string;
  snapshot: UsbSnapshot | null;
  status: string | null;
  t: Translator;
}) {
  const record = device ? historyForDevice(history, device) : undefined;

  return (
    <section className="flex h-full flex-col bg-background">
      {/* detail toolbar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-muted-foreground">
          {device ? device.display_name : t("details")}
        </span>
        {snapshot && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
            <Clock3 className="size-2.5" />
            {formatDate(snapshot.scanned_at)}
          </span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {error ? (
            <ErrorPanel error={error} t={t} />
          ) : device ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={device.instance_key}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="space-y-3"
              >
                <DeviceHeader device={device} history={record} t={t} />
                <Tabs defaultValue="overview">
                  <TabsList variant="line" className="h-7">
                    <TabsTrigger value="overview" className="text-xs px-2">
                      {t("overview")}
                    </TabsTrigger>
                    <TabsTrigger value="descriptors" className="text-xs px-2">
                      {t("descriptors")}
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="text-xs px-2">
                      {t("logs")}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="mt-2">
                    <Overview device={device} history={record} t={t} />
                  </TabsContent>
                  <TabsContent value="descriptors" className="mt-2">
                    <DescriptorList sections={device.descriptor_sections} />
                  </TabsContent>
                  <TabsContent value="logs" className="mt-2">
                    <InfoTable
                      rows={[
                        [t("status"), status ?? "—"],
                        [t("historyPath"), historyPath],
                        [t("logDir"), logDir],
                      ]}
                      mono
                    />
                  </TabsContent>
                </Tabs>
              </motion.div>
            </AnimatePresence>
          ) : (
            <EmptyState icon={Usb} label={t("noDevice")} />
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function DeviceHeader({
  device,
  history,
  t,
}: {
  device: UsbDevice;
  history?: DeviceHistory;
  t: Translator;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold leading-snug">
            {device.display_name}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {compact([device.vendor_name, device.product_name]).join(" · ")}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 rounded-sm text-[10px] h-5",
            history?.active
              ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
          )}
        >
          {history?.active ? t("connected") : t("disconnected")}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        {[
          formatVidPid(device),
          `${t("bus")} ${pad3(device.bus_number)}`,
          `${t("device")} ${pad3(device.device_address)}`,
          device.port_path,
        ].map((text) => (
          <span
            key={text}
            className="inline-flex h-5 items-center rounded-sm border border-border bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground"
          >
            {text}
          </span>
        ))}
      </div>
      <Separator />
    </div>
  );
}

function Overview({
  device,
  history,
  t,
}: {
  device: UsbDevice;
  history?: DeviceHistory;
  t: Translator;
}) {
  const rows: Array<[string, string | number | null | undefined]> = [
    [t("manufacturer"), device.manufacturer],
    [t("serial"), device.identity.serial],
    [t("class"), device.class],
    [t("subclass"), formatHex(device.sub_class, 2)],
    [t("protocol"), formatHex(device.protocol, 2)],
    [t("speed"), device.device_speed],
    [t("negotiated"), device.negotiated_speed],
    [t("lastEvent"), device.last_event],
    [t("insertions"), history?.insertions ?? 0],
    [t("removals"), history?.removals ?? 0],
  ];

  return (
    <div className="space-y-2">
      {device.profiler_error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex gap-2 rounded-sm border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive"
        >
          <CircleAlert className="mt-px size-3 shrink-0" />
          <div>
            <span className="font-medium">{t("profilerError")}</span>
            <p className="mt-0.5 break-words text-[11px] opacity-80">
              {device.profiler_error}
            </p>
          </div>
        </motion.div>
      )}
      <InfoTable
        rows={rows.map(([label, value]) => [
          label,
          value != null ? String(value) : "—",
        ])}
      />
    </div>
  );
}

function InfoTable({
  rows,
  mono,
}: {
  rows: Array<[string, string]>;
  mono?: boolean;
}) {
  return (
    <div className="rounded-sm border border-border overflow-hidden">
      {rows.map(([label, value], idx) => (
        <div
          key={label}
          className={cn(
            "grid grid-cols-[140px_1fr] text-xs",
            idx > 0 && "border-t border-border",
          )}
        >
          <div className="px-2.5 py-1.5 text-muted-foreground bg-muted/30">
            {label}
          </div>
          <div
            className={cn(
              "px-2.5 py-1.5 min-w-0 break-words",
              mono && "font-mono text-[11px]",
            )}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function DescriptorList({ sections }: { sections: DescriptorSection[] }) {
  if (sections.length === 0) {
    return <EmptyState icon={FileText} label="—" compact />;
  }
  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <DescriptorSectionView
          key={`${section.title}-${section.fields.length}`}
          section={section}
        />
      ))}
    </div>
  );
}

function DescriptorSectionView({
  depth = 0,
  section,
}: {
  depth?: number;
  section: DescriptorSection;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-sm border border-border overflow-hidden">
      <button
        className="flex w-full items-center gap-1.5 bg-muted/40 px-2.5 py-1.5 text-left text-xs font-medium hover:bg-muted/60 transition-colors"
        style={{ paddingLeft: 10 + depth * 12 }}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={cn(
            "size-3 text-muted-foreground transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        {section.title}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden"
          >
            {section.fields.length > 0 && (
              <div className="divide-y divide-border">
                {section.fields.map((field) => (
                  <div
                    className="grid grid-cols-[minmax(100px,180px)_1fr] text-[11px]"
                    key={`${field.name}-${field.value.slice(0, 24)}`}
                  >
                    <div className="px-2.5 py-1 text-muted-foreground">
                      {field.name}
                    </div>
                    {field.name === "JSON" ? (
                      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words bg-muted/30 px-2.5 py-1 font-mono text-[10px] leading-4">
                        {field.value}
                      </pre>
                    ) : (
                      <div className="px-2.5 py-1 break-words">
                        {field.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {section.children.length > 0 && (
              <div className="space-y-1 border-t border-border p-1.5">
                {section.children.map((child) => (
                  <DescriptorSectionView
                    depth={depth + 1}
                    key={`${child.title}-${child.fields.length}`}
                    section={child}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Settings Page
   ═══════════════════════════════════════════════════════ */

function SettingsPage({
  backendLocale,
  historyPath,
  language,
  logDir,
  status,
  t,
  theme,
  setTheme,
  onLanguageChange,
}: {
  backendLocale: BackendLocale | null;
  historyPath: string;
  language: string;
  logDir: string;
  status: string | null;
  t: Translator;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  onLanguageChange: (lang: LanguageCode) => void;
}) {
  const activeLanguage: LanguageCode = language.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en";

  return (
    <section className="flex h-full flex-col bg-background">
      <ScrollArea className="min-h-0 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="mx-auto w-full max-w-xl space-y-6 p-6"
        >
          {/* ── Language ── */}
          <SettingsGroup title={t("language")} description={t("languageDescription")}>
            <div className="space-y-0.5">
              {supportedLanguages.map((item) => (
                <button
                  key={item.code}
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-3 py-2 text-left transition-colors",
                    activeLanguage === item.code
                      ? "bg-primary/8 text-foreground"
                      : "text-foreground/70 hover:bg-accent",
                  )}
                  onClick={() => onLanguageChange(item.code)}
                >
                  <div>
                    <div className="text-sm font-medium">{item.nativeLabel}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.label}
                    </div>
                  </div>
                  {activeLanguage === item.code && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    >
                      <Check className="size-3.5 text-primary" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </SettingsGroup>

          {/* ── Appearance ── */}
          <SettingsGroup title={t("appearance")} description={t("appearanceDescription")}>
            <SettingsRow label={t("theme")}>
              <ThemeToggle theme={theme} setTheme={setTheme} t={t} />
            </SettingsRow>
          </SettingsGroup>

          {/* ── Runtime ── */}
          <SettingsGroup title={t("runtime")} description={t("runtimeDescription")}>
            <SettingsRow label={t("hotplugMonitor")}>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs">{t("active")}</span>
              </div>
            </SettingsRow>
            <SettingsRow label={t("backendLocale")}>
              <span className="text-xs font-mono">{backendLocale ?? "—"}</span>
            </SettingsRow>
            <SettingsRow label={t("status")}>
              <span className="text-xs">{status ?? "—"}</span>
            </SettingsRow>
          </SettingsGroup>

          {/* ── Data & Logs ── */}
          <SettingsGroup title={t("dataAndLogs")} description={t("dataAndLogsDescription")}>
            <SettingsRow label={t("historyPath")}>
              <span className="text-[11px] font-mono text-muted-foreground break-all">
                {historyPath}
              </span>
            </SettingsRow>
            <SettingsRow label={t("logDir")}>
              <span className="text-[11px] font-mono text-muted-foreground break-all">
                {logDir}
              </span>
            </SettingsRow>
          </SettingsGroup>
        </motion.div>
      </ScrollArea>
    </section>
  );
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold">{title}</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      <div className="mt-2 rounded-sm border border-border overflow-hidden divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Shared components
   ═══════════════════════════════════════════════════════ */

function ErrorPanel({ error, t }: { error: string; t: Translator }) {
  return (
    <div className="rounded-sm border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
      <div className="flex items-center gap-1.5 font-medium">
        <CircleAlert className="size-3" />
        {t("status")}
      </div>
      <p className="mt-1.5 break-words text-[11px] opacity-80">{error}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
  compact,
}: {
  icon: LucideIcon;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-muted-foreground",
        compact ? "py-8" : "min-h-[180px]",
      )}
    >
      <Icon className="size-5 opacity-40" />
      <p className="text-xs">{label}</p>
    </div>
  );
}

function LoadingTree() {
  return (
    <div className="space-y-1 px-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-7 rounded-sm"
          style={{ width: `${85 - i * 4}%`, marginLeft: i > 2 ? 16 : 0 }}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Pure helpers
   ═══════════════════════════════════════════════════════ */

function flattenDevices(snapshot: UsbSnapshot) {
  const out: UsbDevice[] = [];
  snapshot.buses.forEach((bus) =>
    bus.devices.forEach((d) => collectDevices(d, out)),
  );
  return out;
}

function collectDevices(device: UsbDevice, out: UsbDevice[]) {
  out.push(device);
  device.children.forEach((c) => collectDevices(c, out));
}

function collectExpandedKeys(snapshot: UsbSnapshot) {
  const keys = new Set<string>();
  snapshot.buses.forEach((bus) => {
    if (bus.devices.length > 0) keys.add(`bus:${bus.key}`);
    bus.devices.forEach((d) => collectDeviceExpansion(d, keys));
  });
  return keys;
}

function collectDeviceExpansion(device: UsbDevice, keys: Set<string>) {
  if (device.children.length > 0)
    keys.add(`device:${device.instance_key}`);
  device.children.forEach((c) => collectDeviceExpansion(c, keys));
}

function filterDevice(device: UsbDevice, query: string): UsbDevice | null {
  if (!query) return device;
  const children = device.children
    .map((c) => filterDevice(c, query))
    .filter((c): c is UsbDevice => Boolean(c));
  if (children.length > 0 || deviceMatches(device, query))
    return { ...device, children };
  return null;
}

function deviceMatches(device: UsbDevice, query: string) {
  return [
    device.display_name,
    device.vendor_name,
    device.product_name,
    device.manufacturer,
    device.identity.serial,
    formatVidPid(device),
    device.port_path,
  ].some((v) => matchesText(v, query));
}

function matchesText(value: string | null | undefined, query: string) {
  return Boolean(value?.toLowerCase().includes(query));
}

function countDevices(devices: UsbDevice[]): number {
  return devices.reduce(
    (sum, d) => sum + 1 + countDevices(d.children),
    0,
  );
}

function historyForDevice(history: DeviceHistoryStore, device: UsbDevice) {
  return history.devices[stableKey(device)];
}

function stableKey(device: UsbDevice) {
  const { product_id: pid, serial, vendor_id: vid } = device.identity;
  if (vid !== null && pid !== null && serial)
    return `${hex(vid, 4)}:${hex(pid, 4)}:${serial}`;
  if (vid !== null && pid !== null)
    return `${hex(vid, 4)}:${hex(pid, 4)}@${device.identity.location}`;
  return device.identity.location;
}

function formatVidPid(device: UsbDevice) {
  return `${hex(device.identity.vendor_id, 4)}:${hex(device.identity.product_id, 4)}`;
}

function formatHex(value: number | null | undefined, width: number) {
  return value === null || value === undefined
    ? null
    : `0x${hex(value, width)}`;
}

function hex(value: number | null | undefined, width: number) {
  return value === null || value === undefined
    ? "-".repeat(width)
    : value.toString(16).padStart(width, "0");
}

function pad3(value: number) {
  return value.toString().padStart(3, "0");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function compact(values: Array<string | null | undefined>) {
  return values.filter((v): v is string => Boolean(v));
}

export default App;
