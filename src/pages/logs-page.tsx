import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, FolderOpen, Trash2 } from "lucide-react";
import { api, type LogEntry, type LogLevel, type Plugin } from "../lib/api";
import { button, Checkbox, cn, input, PageHeader } from "../components/ui";

const LEVELS: Record<LogLevel, { label: string; cls: string; rank: number }> = {
  debug: { label: "DEBUG", cls: "text-zinc-400", rank: 0 },
  info: { label: "INFO", cls: "text-sky-600 dark:text-sky-400", rank: 1 },
  warn: { label: "WARN", cls: "text-amber-600 dark:text-amber-400", rank: 2 },
  error: { label: "ERROR", cls: "text-red-600 dark:text-red-400", rank: 3 },
};

const MIN_LEVEL: Record<LogLevel, string> = {
  debug: "全部（含除錯）",
  info: "資訊以上",
  warn: "警告以上",
  error: "只看錯誤",
};

function FilterSelect<T extends string>({ value, items, onChange }: {
  value: T;
  items: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <Select.Root items={items} value={value} onValueChange={(v) => v && onChange(v as T)}>
      <Select.Trigger className={button.outline}>
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="size-4" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false}>
          <Select.Popup className="rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {(Object.entries(items) as [T, string][]).map(([v, label]) => (
              <Select.Item
                key={v}
                value={v}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800"
              >
                <Select.ItemIndicator className="w-4">
                  <Check className="size-4" />
                </Select.ItemIndicator>
                <Select.ItemText>{label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-TW", { hour12: false }) + "." + String(ts % 1000).padStart(3, "0");

export function LogsPage({ logs, clear, plugins }: { logs: LogEntry[]; clear: () => void; plugins: Plugin[] }) {
  const [level, setLevel] = useState<LogLevel>("debug");
  const [site, setSite] = useState("all");
  const [text, setText] = useState("");
  const [follow, setFollow] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);

  const siteItems = useMemo(
    () => ({ all: "所有來源", system: "系統", ...Object.fromEntries(plugins.map((p) => [p.id, p.name])) }) as Record<string, string>,
    [plugins],
  );

  const shown = useMemo(() => {
    const min = LEVELS[level].rank;
    const q = text.trim().toLowerCase();
    return logs.filter(
      (l) =>
        LEVELS[l.level].rank >= min &&
        (site === "all" || (site === "system" ? !l.site : l.site === site)) &&
        (!q || l.msg.toLowerCase().includes(q)),
    );
  }, [logs, level, site, text]);

  useEffect(() => {
    if (follow) bottom.current?.scrollIntoView({ block: "end" });
  }, [shown.length, follow]);

  return (
    <>
      <PageHeader
        title="執行日誌"
        description="每次搜尋的每一頁都會記錄網址、抓到幾筆、耗時，以及外掛在頁面裡的除錯訊息。"
        actions={
          <div className="flex gap-2">
            <Button className={button.outline} onClick={() => api.openLogDir()}>
              <FolderOpen className="size-4" />
              日誌資料夾
            </Button>
            <Button className={button.outline} onClick={clear}>
              <Trash2 className="size-4" />
              清除
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect value={level} items={MIN_LEVEL} onChange={setLevel} />
        <FilterSelect value={site} items={siteItems} onChange={setSite} />
        <Input value={text} onValueChange={setText} placeholder="篩選文字…" className={cn(input, "w-56 py-1.5")} />
        <span className="ml-auto flex items-center gap-4 text-sm text-zinc-500">
          {shown.length} / {logs.length} 筆
          <Checkbox checked={follow} onChange={setFollow}>
            自動捲到最新
          </Checkbox>
        </span>
      </div>

      <div className="h-[calc(100vh-15rem)] overflow-auto rounded-xl border border-zinc-200 bg-white font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950">
        {shown.length === 0 ? (
          <p className="p-6 text-center font-sans text-sm text-zinc-500">沒有日誌。去「商品搜尋」查一次就會出現。</p>
        ) : (
          <table className="w-full">
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="align-top hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="py-1 pr-3 pl-3 whitespace-nowrap text-zinc-400">{time(l.ts)}</td>
                  <td className={cn("py-1 pr-3 font-semibold whitespace-nowrap", LEVELS[l.level].cls)}>
                    {LEVELS[l.level].label}
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap text-zinc-500">{l.site ?? "系統"}</td>
                  <td className="py-1 pr-3 break-all whitespace-pre-wrap">{l.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottom} />
      </div>
    </>
  );
}
