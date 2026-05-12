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
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  FileText,
  HardDrive,
  Languages,
  type LucideIcon,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sun,
  Usb,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DescriptorSection,
  BackendLocale,
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
        ? devices.find((device) => device.instance_key === selectedKey) ?? null
        : null,
    [devices, selectedKey],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", isDark);
    };

    localStorage.setItem("rusbview-theme", theme);
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    if (!payload?.locale || localStorage.getItem("i18nextLng")) {
      return;
    }

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
        if (!disposed) {
          setError(String(reason));
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    listen<UsbMonitorPayload>(EVENT_NAME, (event) => {
      setPayload(event.payload.state);
      setError(null);
    }).then((dispose) => {
      if (disposed) {
        dispose();
      } else {
        unlisten = dispose;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setSelectedKey((current) => {
      if (current && devices.some((device) => device.instance_key === current)) {
        return current;
      }
      return devices[0]?.instance_key ?? null;
    });
  }, [devices, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const keys = collectExpandedKeys(snapshot);
    setExpanded((current) => {
      if (initializedTree.current) {
        const next = new Set(current);
        keys.forEach((key) => next.add(key));
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
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <div className="flex h-screen min-h-[620px] flex-col overflow-hidden bg-background text-foreground">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-md border border-border bg-primary text-primary-foreground">
                <Usb className="size-4" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">
                  {t("appTitle")}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {payload?.status ?? (loading ? t("loading") : t("status"))}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <HeaderNav page={page} setPage={setPage} t={t} />
              <ThemeButtons theme={theme} setTheme={setTheme} t={t} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="rounded-md"
                    disabled={refreshing}
                    size="icon"
                    variant="outline"
                    onClick={refreshNow}
                  >
                    <RefreshCw
                      className={cn("size-4", refreshing && "animate-spin")}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("refresh")}</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <main className="min-h-0 flex-1">
            {page === "settings" ? (
              <SettingsPage
                backendLocale={payload?.locale ?? null}
                historyPath={payload?.historyPath ?? "unavailable"}
                language={i18n.resolvedLanguage ?? i18n.language}
                logDir={payload?.logDir ?? "unavailable"}
                status={payload?.status ?? null}
                t={t}
                theme={theme}
                setTheme={setTheme}
                onLanguageChange={(language) => {
                  void i18n.changeLanguage(language);
                }}
              />
            ) : (
              <ResizablePanelGroup>
                <ResizablePanel defaultSize={32} minSize={24}>
                  <DeviceSidebar
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
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={68} minSize={42}>
                  <DeviceContent
                    device={selectedDevice}
                    error={error}
                    history={history}
                    logDir={payload?.logDir ?? "unavailable"}
                    historyPath={payload?.historyPath ?? "unavailable"}
                    snapshot={snapshot}
                    status={payload?.status ?? null}
                    t={t}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </main>
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}

function HeaderNav({
  page,
  setPage,
  t,
}: {
  page: PageMode;
  setPage: (page: PageMode) => void;
  t: Translator;
}) {
  const items: Array<{
    mode: PageMode;
    label: string;
    icon: LucideIcon;
  }> = [
    { mode: "devices", label: t("pageDevices"), icon: Usb },
    { mode: "settings", label: t("settings"), icon: SettingsIcon },
  ];

  return (
    <div className="flex h-8 items-center rounded-md border border-border bg-muted p-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            aria-pressed={page === item.mode}
            className={cn(
              "h-7 rounded-[6px] border-0 px-2 text-xs",
              page === item.mode
                ? "bg-background text-foreground shadow-none"
                : "text-muted-foreground",
            )}
            key={item.mode}
            size="sm"
            variant="ghost"
            onClick={() => setPage(item.mode)}
          >
            <Icon className="size-3.5" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

function ThemeButtons({
  theme,
  setTheme,
  t,
}: {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  t: Translator;
}) {
  const items: Array<{
    mode: ThemeMode;
    label: string;
    icon: LucideIcon;
  }> = [
    { mode: "system", label: t("system"), icon: Monitor },
    { mode: "light", label: t("light"), icon: Sun },
    { mode: "dark", label: t("dark"), icon: Moon },
  ];

  return (
    <div
      aria-label={t("theme")}
      className="flex h-8 items-center rounded-md border border-border bg-muted p-0.5"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Tooltip key={item.mode}>
            <TooltipTrigger asChild>
              <Button
                aria-pressed={theme === item.mode}
                className={cn(
                  "size-7 rounded-[6px] border-0",
                  theme === item.mode
                    ? "bg-background text-foreground shadow-none"
                    : "text-muted-foreground",
                )}
                size="icon-sm"
                variant="ghost"
                onClick={() => setTheme(item.mode)}
              >
                <Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function DeviceSidebar({
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
  onQueryChange: (query: string) => void;
  onSelect: (key: string) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <aside className="flex h-full min-w-[300px] flex-col bg-sidebar">
      <div className="border-b border-sidebar-border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{t("devices")}</h2>
            <p className="text-xs text-muted-foreground">
              {snapshot
                ? `${snapshot.device_count} ${t("device").toLowerCase()}`
                : t("loading")}
            </p>
          </div>
          <Badge className="rounded-md" variant="outline">
            <Activity className="size-3" />
            {t("activity")}
          </Badge>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 rounded-md pl-8 text-sm"
            placeholder={t("search")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {loading ? (
            <LoadingTree />
          ) : snapshot && snapshot.buses.length > 0 ? (
            <div className="space-y-1">
              {snapshot.buses.map((bus) => (
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
              ))}
            </div>
          ) : (
            <EmptyState icon={Cable} label={t("emptyTopology")} />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

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
  onLanguageChange: (language: LanguageCode) => void;
}) {
  const activeLanguage: LanguageCode = language.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en";

  return (
    <section className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{t("settings")}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {t("settingsSubtitle")}
          </p>
        </div>
        <Badge className="rounded-md" variant="outline">
          <SettingsIcon className="size-3" />
          {t("settings")}
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4"
          initial={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.16 }}
        >
          <SettingsSection
            description={t("languageDescription")}
            icon={Languages}
            title={t("language")}
          >
            <div className="flex flex-wrap gap-2">
              {supportedLanguages.map((item) => (
                <Button
                  aria-pressed={activeLanguage === item.code}
                  className={cn(
                    "h-9 rounded-md px-3",
                    activeLanguage === item.code &&
                      "border-primary/30 bg-primary/10",
                  )}
                  key={item.code}
                  variant="outline"
                  onClick={() => onLanguageChange(item.code)}
                >
                  <span>{item.nativeLabel}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.label}
                  </span>
                </Button>
              ))}
            </div>
            <SettingRow
              label={t("currentLanguage")}
              value={
                supportedLanguages.find((item) => item.code === activeLanguage)
                  ?.nativeLabel ?? activeLanguage
              }
            />
          </SettingsSection>

          <SettingsSection
            description={t("appearanceDescription")}
            icon={SlidersHorizontal}
            title={t("appearance")}
          >
            <ThemeButtons setTheme={setTheme} t={t} theme={theme} />
          </SettingsSection>

          <SettingsSection
            description={t("runtimeDescription")}
            icon={Monitor}
            title={t("runtime")}
          >
            <SettingRow
              label={t("hotplugMonitor")}
              value={`${t("active")} · ${status ?? "N/A"}`}
            />
            <SettingRow
              label={t("backendLocale")}
              value={backendLocale ?? "N/A"}
            />
          </SettingsSection>

          <SettingsSection
            description={t("dataAndLogsDescription")}
            icon={Database}
            title={t("dataAndLogs")}
          >
            <SettingRow label={t("historyPath")} value={historyPath} mono />
            <SettingRow label={t("logDir")} value={logDir} mono />
          </SettingsSection>
        </motion.div>
      </ScrollArea>
    </section>
  );
}

function SettingsSection({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={cn(
          "min-w-0 break-words",
          mono && "font-mono text-xs leading-5",
        )}
      >
        {value}
      </div>
    </div>
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
    .map((device) => filterDevice(device, query))
    .filter((device): device is UsbDevice => Boolean(device));
  const hasChildren = visibleDevices.length > 0;
  const treeKey = `bus:${bus.key}`;
  const isExpanded = query.length > 0 || expanded.has(treeKey);

  if (query && !hasChildren && !matchesText(bus.name, query)) {
    return null;
  }

  return (
    <motion.div layout className="space-y-1">
      <TreeRow
        depth={0}
        icon={Cable}
        isExpanded={isExpanded}
        muted={`${bus.controller} · ${countDevices(bus.devices)} ${t("device").toLowerCase()}`}
        title={bus.name}
        toggleDisabled={!hasChildren}
        onClick={() => hasChildren && toggleExpanded(treeKey)}
        onToggle={() => toggleExpanded(treeKey)}
      />
      <AnimatePresence initial={false}>
        {isExpanded && hasChildren ? (
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {visibleDevices.map((device) => (
              <DeviceNode
                depth={1}
                device={device}
                expanded={expanded}
                history={history}
                key={device.instance_key}
                query={query}
                selectedKey={selectedKey}
                t={t}
                toggleExpanded={toggleExpanded}
                onSelect={onSelect}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function DeviceNode({
  depth,
  device,
  expanded,
  history,
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
    <motion.div layout className="space-y-1">
      <TreeRow
        depth={depth}
        icon={Icon}
        isExpanded={isExpanded}
        isSelected={selectedKey === device.instance_key}
        muted={`${formatVidPid(device)} · ${device.port_path}`}
        right={
          <div className="flex w-[64px] shrink-0 justify-end gap-1 text-[11px]">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{record?.insertions ?? 0}
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              -{record?.removals ?? 0}
            </span>
          </div>
        }
        title={device.display_name}
        toggleDisabled={!hasChildren}
        onClick={() => onSelect(device.instance_key)}
        onToggle={() => toggleExpanded(treeKey)}
      />
      <AnimatePresence initial={false}>
        {isExpanded && hasChildren ? (
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {device.children.map((child) => (
              <DeviceNode
                depth={depth + 1}
                device={child}
                expanded={expanded}
                history={history}
                key={child.instance_key}
                query={query}
                selectedKey={selectedKey}
                t={t}
                toggleExpanded={toggleExpanded}
                onSelect={onSelect}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function TreeRow({
  depth,
  icon: Icon,
  isExpanded,
  isSelected,
  muted,
  right,
  title,
  toggleDisabled,
  onClick,
  onToggle,
}: {
  depth: number;
  icon: LucideIcon;
  isExpanded: boolean;
  isSelected?: boolean;
  muted: string;
  right?: ReactNode;
  title: string;
  toggleDisabled: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  const ToggleIcon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "group flex h-11 items-center gap-1 rounded-md border border-transparent px-1.5 text-left transition-colors",
        isSelected
          ? "border-primary/25 bg-primary/10"
          : "hover:bg-sidebar-accent",
      )}
      style={{ paddingLeft: 6 + depth * 16 }}
    >
      <Button
        className="size-6 rounded-[6px] text-muted-foreground"
        disabled={toggleDisabled}
        size="icon-xs"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        {toggleDisabled ? null : <ToggleIcon className="size-3.5" />}
      </Button>
      <button
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] py-1 text-left"
        type="button"
        onClick={onClick}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-5">{title}</span>
          <span className="block truncate text-xs leading-4 text-muted-foreground">
            {muted}
          </span>
        </span>
      </button>
      {right}
    </div>
  );
}

function DeviceContent({
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
    <section className="flex h-full min-w-[420px] flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{t("details")}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {snapshot
              ? `${t("status")}: ${status ?? "N/A"}`
              : t("loading")}
          </p>
        </div>
        {snapshot ? (
          <Badge className="rounded-md" variant="outline">
            <Clock3 className="size-3" />
            {formatDate(snapshot.scanned_at)}
          </Badge>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {error ? (
            <ErrorPanel error={error} t={t} />
          ) : device ? (
            <motion.div
              key={device.instance_key}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
              initial={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16 }}
            >
              <DeviceHeader device={device} history={record} t={t} />
              <Tabs defaultValue="overview">
                <TabsList className="rounded-md" variant="line">
                  <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
                  <TabsTrigger value="descriptors">
                    {t("descriptors")}
                  </TabsTrigger>
                  <TabsTrigger value="logs">{t("logs")}</TabsTrigger>
                </TabsList>
                <TabsContent className="mt-3" value="overview">
                  <Overview device={device} history={record} t={t} />
                </TabsContent>
                <TabsContent className="mt-3" value="descriptors">
                  <DescriptorList sections={device.descriptor_sections} />
                </TabsContent>
                <TabsContent className="mt-3" value="logs">
                  <PathList
                    rows={[
                      [t("status"), status ?? "N/A"],
                      [t("historyPath"), historyPath],
                      [t("logDir"), logDir],
                    ]}
                  />
                </TabsContent>
              </Tabs>
            </motion.div>
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
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-semibold leading-7">
            {device.display_name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {compact([device.vendor_name, device.product_name]).join(" · ")}
          </p>
        </div>
        <Badge
          className={cn(
            "rounded-md",
            history?.active ? "border-emerald-500/40" : "",
          )}
          variant="outline"
        >
          {history?.active ? t("connected") : t("disconnected")}
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge className="rounded-md" variant="secondary">
          {formatVidPid(device)}
        </Badge>
        <Badge className="rounded-md" variant="outline">
          {t("bus")} {pad3(device.bus_number)}
        </Badge>
        <Badge className="rounded-md" variant="outline">
          {t("device")} {pad3(device.device_address)}
        </Badge>
        <Badge className="rounded-md" variant="outline">
          {t("path")} {device.port_path}
        </Badge>
      </div>
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
  const facts: Array<[string, string | number | null | undefined]> = [
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
    <div className="space-y-3">
      {device.profiler_error ? (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">{t("profilerError")}</div>
            <div className="mt-1 break-words text-xs">{device.profiler_error}</div>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {facts.map(([label, value]) => (
          <Fact key={label} label={label} value={value ?? "N/A"} />
        ))}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function DescriptorList({ sections }: { sections: DescriptorSection[] }) {
  if (sections.length === 0) {
    return <EmptyState icon={FileText} label="N/A" />;
  }

  return (
    <div className="space-y-3">
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
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div
        className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium"
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        {section.title}
      </div>
      <div className="divide-y divide-border">
        {section.fields.map((field) => (
          <div
            className="grid grid-cols-[minmax(120px,220px)_1fr] gap-3 px-3 py-2 text-xs"
            key={`${field.name}-${field.value.slice(0, 24)}`}
          >
            <div className="text-muted-foreground">{field.name}</div>
            {field.name === "JSON" ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 font-mono text-[11px] leading-5">
                {field.value}
              </pre>
            ) : (
              <div className="break-words text-foreground">{field.value}</div>
            )}
          </div>
        ))}
      </div>
      {section.children.length > 0 ? (
        <div className="space-y-2 border-t border-border p-2">
          {section.children.map((child) => (
            <DescriptorSectionView
              depth={depth + 1}
              key={`${child.title}-${child.fields.length}`}
              section={child}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PathList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="rounded-md border border-border bg-card">
      {rows.map(([label, value], index) => (
        <div key={label}>
          <div className="grid grid-cols-[140px_1fr] gap-3 px-3 py-3 text-sm">
            <div className="text-muted-foreground">{label}</div>
            <div className="min-w-0 break-words font-mono text-xs leading-5">
              {value}
            </div>
          </div>
          {index < rows.length - 1 ? <Separator /> : null}
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ error, t }: { error: string; t: Translator }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      <div className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-4" />
        {t("status")}
      </div>
      <p className="mt-2 break-words text-xs leading-5">{error}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-muted-foreground">
      <Icon className="size-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function LoadingTree() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 9 }).map((_, index) => (
        <Skeleton className="h-10 rounded-md" key={index} />
      ))}
    </div>
  );
}

function flattenDevices(snapshot: UsbSnapshot) {
  const devices: UsbDevice[] = [];
  snapshot.buses.forEach((bus) => {
    bus.devices.forEach((device) => collectDevices(device, devices));
  });
  return devices;
}

function collectDevices(device: UsbDevice, devices: UsbDevice[]) {
  devices.push(device);
  device.children.forEach((child) => collectDevices(child, devices));
}

function collectExpandedKeys(snapshot: UsbSnapshot) {
  const keys = new Set<string>();
  snapshot.buses.forEach((bus) => {
    if (bus.devices.length > 0) {
      keys.add(`bus:${bus.key}`);
    }
    bus.devices.forEach((device) => collectDeviceExpansion(device, keys));
  });
  return keys;
}

function collectDeviceExpansion(device: UsbDevice, keys: Set<string>) {
  if (device.children.length > 0) {
    keys.add(`device:${device.instance_key}`);
  }
  device.children.forEach((child) => collectDeviceExpansion(child, keys));
}

function filterDevice(device: UsbDevice, query: string): UsbDevice | null {
  if (!query) {
    return device;
  }

  const children = device.children
    .map((child) => filterDevice(child, query))
    .filter((child): child is UsbDevice => Boolean(child));

  if (children.length > 0 || deviceMatches(device, query)) {
    return { ...device, children };
  }

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
  ].some((value) => matchesText(value, query));
}

function matchesText(value: string | null | undefined, query: string) {
  return Boolean(value?.toLowerCase().includes(query));
}

function countDevices(devices: UsbDevice[]): number {
  return devices.reduce(
    (total, device) => total + 1 + countDevices(device.children),
    0,
  );
}

function historyForDevice(history: DeviceHistoryStore, device: UsbDevice) {
  return history.devices[stableKey(device)];
}

function stableKey(device: UsbDevice) {
  const { product_id: productId, serial, vendor_id: vendorId } = device.identity;
  if (vendorId !== null && productId !== null && serial) {
    return `${hex(vendorId, 4)}:${hex(productId, 4)}:${serial}`;
  }
  if (vendorId !== null && productId !== null) {
    return `${hex(vendorId, 4)}:${hex(productId, 4)}@${device.identity.location}`;
  }
  return device.identity.location;
}

function formatVidPid(device: UsbDevice) {
  return `${hex(device.identity.vendor_id, 4)}:${hex(device.identity.product_id, 4)}`;
}

function formatHex(value: number | null | undefined, width: number) {
  return value === null || value === undefined ? null : `0x${hex(value, width)}`;
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
  return values.filter((value): value is string => Boolean(value));
}

type Translator = TFunction<"translation", undefined>;

export default App;
