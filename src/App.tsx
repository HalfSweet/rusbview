import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { TreeSidebar } from "@/components/TreeSidebar";
import { DetailPane } from "@/components/DetailPane";
import { SettingsPage } from "@/components/SettingsPage";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { backendLocaleToLanguage } from "@/lib/i18n";
import { collectExpandedKeys, flattenDevices } from "@/lib/usb";
import type {
  PageMode,
  ThemeMode,
  UsbMonitorPayload,
  UsbStatePayload,
} from "@/lib/types";

const EVENT_NAME = "usb-state-changed";
const MENU_SHOW_DEVICES = "menu-show-devices";
const MENU_SHOW_SETTINGS = "menu-show-settings";

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

  /* ── Theme ── */
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

  /* ── Backend locale sync ── */
  useEffect(() => {
    if (!payload?.locale || localStorage.getItem("i18nextLng")) return;
    void i18n.changeLanguage(backendLocaleToLanguage(payload.locale));
  }, [i18n, payload?.locale]);

  /* ── Initial fetch + live events ── */
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    invoke<UsbStatePayload>("get_usb_state")
      .then((state) => {
        if (!disposed) { setPayload(state); setError(null); }
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

    return () => { disposed = true; unlisten?.(); };
  }, []);

  /* ── Native menu and settings shortcut ── */
  useEffect(() => {
    let disposed = false;
    const disposers: Array<() => void> = [];

    listen<void>(MENU_SHOW_DEVICES, () => setPage("devices")).then((dispose) => {
      if (disposed) dispose();
      else disposers.push(dispose);
    });

    listen<void>(MENU_SHOW_SETTINGS, () => setPage("settings")).then((dispose) => {
      if (disposed) dispose();
      else disposers.push(dispose);
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPage("settings");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  /* ── Auto-select first device ── */
  useEffect(() => {
    if (!snapshot) return;
    setSelectedKey((current) => {
      if (current && devices.some((d) => d.instance_key === current))
        return current;
      return devices[0]?.instance_key ?? null;
    });
  }, [devices, snapshot]);

  /* ── Auto-expand tree ── */
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
          <main className="min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              {page === "settings" ? (
                <motion.div
                  key="settings"
                  className="h-full w-full"
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
                    onBack={() => setPage("devices")}
                    onLanguageChange={(lang) => void i18n.changeLanguage(lang)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="devices"
                  className="h-full w-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <ResizablePanelGroup>
                    <ResizablePanel defaultSize="30" minSize="18" maxSize="45">
                      <TreeSidebar
                        expanded={expanded}
                        loading={loading}
                        query={query}
                        refreshing={refreshing}
                        selectedKey={selectedKey}
                        snapshot={snapshot}
                        t={t}
                        toggleExpanded={toggleExpanded}
                        onQueryChange={setQuery}
                        onRefresh={refreshNow}
                        onSelect={setSelectedKey}
                      />
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel defaultSize="70" minSize="40">
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

export default App;
