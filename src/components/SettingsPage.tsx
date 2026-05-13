import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";

import { ThemeToggle } from "@/components/Toolbar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supportedLanguages } from "@/lib/i18n";
import type {
  BackendLocale,
  LanguageCode,
  ThemeMode,
  Translator,
} from "@/lib/types";

export function SettingsPage({
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
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}
