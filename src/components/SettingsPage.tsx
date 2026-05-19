import { useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Download,
  LoaderCircle,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { supportedLanguages } from "@/lib/i18n";
import type {
  BackendLocale,
  LanguageCode,
  ThemeMode,
  Translator,
} from "@/lib/types";

type UpdaterModule = typeof import("@tauri-apps/plugin-updater");
type AvailableUpdate = NonNullable<
  Awaited<ReturnType<UpdaterModule["check"]>>
>;

type UpdatePhase =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "downloading"
  | "ready"
  | "restarting"
  | "error";

type UpdateState = {
  phase: UpdatePhase;
  contentLength?: number | null;
  date?: string | null;
  downloaded?: number;
  error?: string;
  notes?: string | null;
  version?: string;
};

export function SettingsPage({
  backendLocale,
  historyPath,
  language,
  logDir,
  status,
  t,
  theme,
  setTheme,
  onBack,
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
  onBack: () => void;
  onLanguageChange: (lang: LanguageCode) => void;
}) {
  const activeLanguage: LanguageCode = language.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en";
  const pendingUpdate = useRef<AvailableUpdate | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: "idle",
  });

  async function checkForUpdate() {
    pendingUpdate.current = null;
    setUpdateState({ phase: "checking" });

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (!update) {
        setUpdateState({ phase: "latest" });
        return;
      }

      pendingUpdate.current = update;
      setUpdateState({
        phase: "available",
        date: update.date ?? null,
        notes: update.body ?? null,
        version: update.version,
      });
    } catch (error) {
      setUpdateState({
        phase: "error",
        error: getErrorMessage(error),
      });
    }
  }

  async function downloadAndInstallUpdate() {
    const update = pendingUpdate.current;
    if (!update) return;

    let downloaded = 0;
    setUpdateState((current) => ({
      ...current,
      phase: "downloading",
      contentLength: null,
      downloaded: 0,
      error: undefined,
    }));

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setUpdateState((current) => ({
              ...current,
              contentLength: event.data.contentLength ?? null,
              downloaded: 0,
            }));
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setUpdateState((current) => ({
              ...current,
              downloaded,
            }));
            break;
          case "Finished":
            setUpdateState((current) => ({
              ...current,
              downloaded: current.contentLength ?? current.downloaded,
            }));
            break;
        }
      });

      setUpdateState((current) => ({
        ...current,
        phase: "ready",
        error: undefined,
      }));
    } catch (error) {
      setUpdateState((current) => ({
        ...current,
        phase: "error",
        error: getErrorMessage(error),
      }));
    }
  }

  async function restartApp() {
    setUpdateState((current) => ({
      ...current,
      phase: "restarting",
      error: undefined,
    }));

    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      setUpdateState((current) => ({
        ...current,
        phase: "error",
        error: getErrorMessage(error),
      }));
    }
  }

  return (
    <section className="flex h-full flex-col bg-background">
      <ScrollArea className="min-h-0 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="mx-auto w-full max-w-xl space-y-6 p-6"
        >
          <div className="flex items-start gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={t("backToDevices")}
                  className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={onBack}
                >
                  <ArrowLeft className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("backToDevices")}</TooltipContent>
            </Tooltip>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold leading-snug">
                {t("settings")}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("settingsSubtitle")}
              </p>
            </div>
          </div>

          {/* Language */}
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

          {/* Appearance */}
          <SettingsGroup title={t("appearance")} description={t("appearanceDescription")}>
            <SettingsRow label={t("theme")}>
              <ThemeToggle theme={theme} setTheme={setTheme} t={t} />
            </SettingsRow>
          </SettingsGroup>

          {/* Updates */}
          <SettingsGroup title={t("updates")} description={t("updatesDescription")}>
            <SettingsRow label={t("updateStatus")}>
              <UpdateStatus state={updateState} t={t} />
            </SettingsRow>
            {updateState.phase === "available" && updateState.date && (
              <SettingsRow label={t("releaseDate")}>
                <span className="text-xs text-muted-foreground">
                  {formatUpdateDate(updateState.date, language)}
                </span>
              </SettingsRow>
            )}
            {updateState.phase === "available" && updateState.notes && (
              <SettingsRow label={t("releaseNotes")}>
                <p className="max-w-80 whitespace-pre-wrap text-right text-[11px] leading-relaxed text-muted-foreground">
                  {updateState.notes}
                </p>
              </SettingsRow>
            )}
            {updateState.phase === "downloading" && (
              <SettingsRow label={t("updateProgress")}>
                <span className="text-xs text-muted-foreground">
                  {formatDownloadProgress(updateState, language, t)}
                </span>
              </SettingsRow>
            )}
            {updateState.phase === "error" && updateState.error && (
              <SettingsRow label={t("updateError")}>
                <span className="max-w-80 break-words text-right text-[11px] text-destructive">
                  {updateState.error}
                </span>
              </SettingsRow>
            )}
            <SettingsRow label={t("updateAction")}>
              <UpdateActionButton
                state={updateState}
                t={t}
                onCheck={checkForUpdate}
                onInstall={downloadAndInstallUpdate}
                onRestart={restartApp}
              />
            </SettingsRow>
          </SettingsGroup>

          {/* Runtime */}
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

          {/* Data & Logs */}
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
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function UpdateStatus({
  state,
  t,
}: {
  state: UpdateState;
  t: Translator;
}) {
  const message = getUpdateStatusMessage(state, t);

  return (
    <span
      aria-live="polite"
      className={cn(
        "text-xs",
        state.phase === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {message}
    </span>
  );
}

function UpdateActionButton({
  state,
  t,
  onCheck,
  onInstall,
  onRestart,
}: {
  state: UpdateState;
  t: Translator;
  onCheck: () => void;
  onInstall: () => void;
  onRestart: () => void;
}) {
  if (state.phase === "available") {
    return (
      <Button size="xs" onClick={onInstall}>
        <Download className="size-3" />
        {t("downloadAndInstall")}
      </Button>
    );
  }

  if (state.phase === "ready") {
    return (
      <Button size="xs" onClick={onRestart}>
        <RotateCcw className="size-3" />
        {t("restartToUpdate")}
      </Button>
    );
  }

  const busy =
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "restarting";

  return (
    <Button size="xs" variant="outline" disabled={busy} onClick={onCheck}>
      {busy ? (
        <LoaderCircle className="size-3 animate-spin" />
      ) : (
        <RefreshCw className="size-3" />
      )}
      {getUpdateActionLabel(state.phase, t)}
    </Button>
  );
}

function getUpdateStatusMessage(state: UpdateState, t: Translator) {
  switch (state.phase) {
    case "checking":
      return t("checkingForUpdates");
    case "latest":
      return t("latestVersionInstalled");
    case "available":
      return t("updateAvailableVersion", {
        version: state.version ?? t("unknownVersion"),
      });
    case "downloading":
      return t("downloadingUpdate");
    case "ready":
      return t("updateReady");
    case "restarting":
      return t("restartingApp");
    case "error":
      return t("updateFailed");
    case "idle":
    default:
      return t("updatesIdle");
  }
}

function getUpdateActionLabel(phase: UpdatePhase, t: Translator) {
  switch (phase) {
    case "checking":
      return t("checkingForUpdates");
    case "downloading":
      return t("downloadingUpdate");
    case "restarting":
      return t("restartingApp");
    default:
      return t("checkForUpdates");
  }
}

function formatDownloadProgress(
  state: UpdateState,
  language: string,
  t: Translator,
) {
  const downloaded = formatBytes(state.downloaded ?? 0, language);
  if (!state.contentLength) {
    return t("downloadedProgress", { downloaded });
  }

  return t("downloadProgressWithTotal", {
    downloaded,
    total: formatBytes(state.contentLength, language),
  });
}

function formatBytes(bytes: number, language: string) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = unitIndex === 0 ? 0 : 1;
  const formatter = new Intl.NumberFormat(language, {
    maximumFractionDigits,
  });

  return `${formatter.format(value)} ${units[unitIndex]}`;
}

function formatUpdateDate(value: string, language: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function ThemeToggle({
  theme,
  setTheme,
  t,
}: {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
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
