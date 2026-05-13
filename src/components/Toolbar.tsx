import {
  FolderTree,
  type LucideIcon,
  Monitor,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PageMode, ThemeMode, Translator } from "@/lib/types";

export function Toolbar({
  page,
  setPage,
  theme,
  setTheme,
  refreshing,
  onRefresh,
  t,
}: {
  page: PageMode;
  setPage: (p: PageMode) => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  refreshing: boolean;
  onRefresh: () => void;
  t: Translator;
}) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-end border-b border-border px-3 select-none">
      <div className="flex items-center gap-1">
        <SegmentedControl
          items={[
            { key: "devices" as const, label: t("pageDevices"), icon: FolderTree },
            { key: "settings" as const, label: t("settings"), icon: SettingsIcon },
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
              onClick={onRefresh}
            >
              <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("refresh")}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

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

export function ThemeToggle({
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
