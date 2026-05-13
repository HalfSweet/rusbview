import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Usb,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  compact,
  formatDate,
  formatHex,
  formatVidPid,
  historyForDevice,
  pad3,
} from "@/lib/usb";
import type {
  DescriptorSection,
  DeviceHistory,
  DeviceHistoryStore,
  Translator,
  UsbDevice,
  UsbSnapshot,
} from "@/lib/types";

export function DetailPane({
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
      {/* toolbar */}
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
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-muted-foreground">
              <Usb className="size-5 opacity-40" />
              <p className="text-xs">{t("noDevice")}</p>
            </div>
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
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <FileText className="size-5 opacity-40" />
        <p className="text-xs">—</p>
      </div>
    );
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
