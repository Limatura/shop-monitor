import type { LucideIcon } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { ScanSearch } from "lucide-react";
import { cn, StatusDot } from "./ui";

export interface NavItem<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
}

export function Sidebar<K extends string>({ items, active, onSelect, collapsed, connected }: {
  items: NavItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  collapsed: boolean;
  connected: boolean;
}) {
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/80 transition-[width] duration-200 dark:border-zinc-800 dark:bg-zinc-950",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
          <ScanSearch className="size-4.5" />
        </div>
        {!collapsed && <span className="truncate font-semibold">Shop Monitor</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {items.map(({ key, label, icon: Icon }) => {
          const isActive = key === active;
          const link = (
            <button
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "relative flex h-9 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                isActive
                  ? "bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
                collapsed && "justify-center px-0",
              )}
            >
              {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />}
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          );
          if (!collapsed) return <div key={key}>{link}</div>;
          return (
            <Tooltip.Root key={key}>
              <Tooltip.Trigger render={link} />
              <Tooltip.Portal>
                <Tooltip.Positioner side="right" sideOffset={8}>
                  <Tooltip.Popup className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow dark:bg-zinc-100 dark:text-zinc-900">
                    {label}
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </nav>

      <div className="p-3">
        {collapsed ? (
          <div className="flex justify-center py-2" title={connected ? "擴充功能已連線" : "擴充功能未連線"}>
            <StatusDot ok={connected} />
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">系統狀態</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-medium">
              <StatusDot ok={connected} />
              {connected ? "擴充功能已連線" : "擴充功能未連線"}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
