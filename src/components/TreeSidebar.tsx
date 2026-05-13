import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Cable,
  ChevronDown,
  ChevronRight,
  HardDrive,
  type LucideIcon,
  Search,
  Usb,
  X,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { countDevices, filterDevice, formatVidPid, matchesText } from "@/lib/usb";
import type {
  Translator,
  UsbBus,
  UsbDevice,
  UsbSnapshot,
} from "@/lib/types";

export function TreeSidebar({
  expanded,
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
    <aside className="flex h-full min-w-[220px] flex-col border-r border-border bg-sidebar">
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
                key={bus.key}
                query={normalizedQuery}
                selectedKey={selectedKey}
                t={t}
                toggleExpanded={toggleExpanded}
                onSelect={onSelect}
              />
            ))
          ) : (
            <EmptyTree label={t("emptyTopology")} />
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
  query,
  selectedKey,
  t,
  toggleExpanded,
  onSelect,
}: {
  bus: UsbBus;
  expanded: Set<string>;
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

  const deviceCount = countDevices(bus.devices);

  return (
    <div>
      <TreeItem
        depth={0}
        icon={Cable}
        isExpanded={isExpanded}
        hasChildren={hasChildren}
        label={bus.name}
        sublabel={`${bus.controller} · ${deviceCount} ${t("device").toLowerCase()}`}
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
  const childCount = hasChildren ? countDevices(device.children) : 0;
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
          childCount > 0 ? (
            <span className="ml-auto shrink-0 rounded-sm bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
              {childCount}
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

function EmptyTree({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
      <Cable className="size-5 opacity-40" />
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
