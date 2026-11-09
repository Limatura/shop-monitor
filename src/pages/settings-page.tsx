import { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
import { NumberField } from "@base-ui/react/number-field";
import { Minus, Plus, Save } from "lucide-react";
import { api, type Plugin, type Settings } from "../lib/api";
import { button, Card, Checkbox, PageHeader, StatusDot } from "../components/ui";

function NumberInput({ value, onChange, min, max, step = 1 }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const btn =
    "flex size-9 cursor-pointer items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800";
  return (
    <NumberField.Root value={value} onValueChange={(v) => v != null && onChange(v)} min={min} max={max} step={step}>
      <NumberField.Group className="flex w-40 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        <NumberField.Decrement className={btn}>
          <Minus className="size-4" />
        </NumberField.Decrement>
        <NumberField.Input className="w-full min-w-0 border-x border-zinc-200 bg-transparent text-center text-sm tabular-nums outline-none dark:border-zinc-700" />
        <NumberField.Increment className={btn}>
          <Plus className="size-4" />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage({ settings, plugins, connected, onSaved }: {
  settings: Settings;
  plugins: Plugin[];
  connected: boolean;
  onSaved: (s: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [msg, setMsg] = useState("");
  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const defaults = new Set(draft.defaultSites ?? plugins.map((p) => p.id));

  const save = async () => {
    try {
      const saved = await api.saveSettings(draft);
      onSaved(saved);
      setMsg("已儲存");
    } catch (e) {
      setMsg(`儲存失敗：${e}`);
    }
  };

  return (
    <>
      <PageHeader
        title="系統設定"
        description="搜尋行為與預設值。"
        actions={
          <div className="flex items-center gap-3">
            {msg && !dirty && <span className="text-sm text-zinc-500">{msg}</span>}
            <Button className={button.primary} disabled={!dirty} onClick={save}>
              <Save className="size-4" />
              儲存
            </Button>
          </div>
        }
      />

      <div className="grid gap-4">
        <Card title="搜尋" description="分頁只對搜尋網址含 {page} 的外掛有效；某頁沒有新商品時會提早停止。">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <Row label="每個網站載入頁數" hint="頁數越多越完整，但越慢、越容易觸發驗證。">
              <NumberInput value={draft.maxPages} min={1} max={20} onChange={(maxPages) => setDraft({ ...draft, maxPages })} />
            </Row>
            <Row label="換頁間隔（毫秒）" hint="同一網站兩頁之間的等待時間。">
              <NumberInput
                value={draft.pageDelayMs}
                min={0}
                max={60000}
                step={500}
                onChange={(pageDelayMs) => setDraft({ ...draft, pageDelayMs })}
              />
            </Row>
            <Row
              label="開啟方式"
              hint="獨立視窗：每頁開一個不搶焦點的視窗，載入完整但會閃一下。背景分頁：較安靜，但 Chrome 會降速，延遲載入的商品可能抓不到。"
            >
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-zinc-200 text-sm dark:border-zinc-700">
                {(["window", "tab"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft({ ...draft, openMode: m })}
                    className={
                      "cursor-pointer px-3 py-1.5 " +
                      (draft.openMode === m
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800")
                    }
                  >
                    {m === "window" ? "獨立視窗" : "背景分頁"}
                  </button>
                ))}
              </div>
            </Row>
            <div className="py-3">
              <p className="text-sm font-medium">預設勾選的網站</p>
              <p className="mt-0.5 text-xs text-zinc-500">開啟程式時，搜尋頁預設要查的網站。</p>
              <div className="mt-3 flex flex-wrap gap-5">
                {plugins.map((p) => (
                  <Checkbox
                    key={p.id}
                    checked={defaults.has(p.id)}
                    onChange={(on) => {
                      const next = new Set(defaults);
                      if (on) next.add(p.id);
                      else next.delete(p.id);
                      setDraft({ ...draft, defaultSites: [...next] });
                    }}
                  >
                    {p.name}
                  </Checkbox>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="瀏覽器擴充功能">
          <p className="flex items-center gap-2 text-sm">
            <StatusDot ok={connected} />
            {connected ? "已連線" : "未連線"}
            <span className="text-zinc-500">（ws://127.0.0.1:17890）</span>
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              在 <code className="font-mono">extension</code> 資料夾執行 <code className="font-mono">pnpm build</code>
            </li>
            <li>
              Chrome/Edge 開啟 <code className="font-mono">chrome://extensions</code>，開啟開發人員模式
            </li>
            <li>
              按「載入未封裝項目」，選擇 <code className="font-mono">extension/.output/chrome-mv3</code>
            </li>
            <li>在擴充功能「詳細資料」中開啟「允許使用者指令碼」</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
