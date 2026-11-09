import { useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@base-ui/react/button";
import { Input } from "@base-ui/react/input";
import { Select } from "@base-ui/react/select";
import { Tooltip } from "@base-ui/react/tooltip";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import type { Item, Plugin } from "../lib/api";
import type { SearchState } from "../lib/use-search";
import { proxiedImage } from "../lib/img";
import { button, Checkbox, cn, input, PageHeader } from "../components/ui";

type Sort = "price-asc" | "price-desc" | "site";
const SORTS: Record<Sort, string> = {
  "price-asc": "價格低 → 高",
  "price-desc": "價格高 → 低",
  site: "依網站",
};

export function SearchPage({ plugins, connected, search }: {
  plugins: Plugin[];
  connected: boolean;
  search: SearchState;
}) {
  const { query, setQuery, selected, setSelected, sites, results, error, busy, run } = search;
  const [sort, setSort] = useState<Sort>("price-asc");

  const sorted = useMemo(() => {
    const r = [...results];
    const p = (x: Item) => x.price ?? Number.POSITIVE_INFINITY;
    if (sort === "price-asc") r.sort((a, b) => p(a) - p(b));
    if (sort === "price-desc") r.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    if (sort === "site") r.sort((a, b) => a.site.localeCompare(b.site) || p(a) - p(b));
    return r;
  }, [results, sort]);

  const nameOf = (id: string) => plugins.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title="商品搜尋" description="一次搜尋多個購物網站，結果會依網站陸續出現。" />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="搜尋商品，例如：iPhone 16 128G"
            className={cn(input, "w-full py-2.5 pl-9 text-base")}
          />
        </div>
        <Button type="submit" className={button.primary} disabled={!connected || busy || !query.trim() || !selected.size}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "搜尋中" : "搜尋"}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {plugins.map((p) => {
          const st = sites[p.id];
          return (
            <div key={p.id} className="flex items-center gap-2">
              <Checkbox
                checked={selected.has(p.id)}
                onChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(p.id);
                  else next.delete(p.id);
                  setSelected(next);
                }}
              >
                {p.name}
              </Checkbox>
              {st && (
                <span
                  className={cn(
                    "text-xs",
                    st.error ? "text-red-600" : st.loading ? "text-zinc-500" : "text-emerald-600",
                  )}
                >
                  {st.loading ? `第 ${st.page + 1} 頁… ` : ""}
                  {st.count} 筆
                </span>
              )}
              {st?.error && (
                <Tooltip.Root>
                  <Tooltip.Trigger render={<span />} className="max-w-56 truncate text-xs text-red-600">
                    {st.error}
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Positioner sideOffset={6}>
                      <Tooltip.Popup className="max-w-sm rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow">
                        {st.error}
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {sorted.length > 0 && (
        <div className="mt-6 mb-3 flex items-center justify-between text-sm text-zinc-500">
          共 {sorted.length} 筆
          <Select.Root items={SORTS} value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
            <Select.Trigger className={button.outline}>
              <Select.Value />
              <Select.Icon>
                <ChevronDown className="size-4" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={4} alignItemWithTrigger={false}>
                <Select.Popup className="rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  {Object.entries(SORTS).map(([value, label]) => (
                    <Select.Item
                      key={value}
                      value={value}
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
        </div>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {sorted.map((it) => (
          <li
            key={`${it.site}:${it.id ?? it.url}`}
            onClick={() => openUrl(it.url)}
            className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            {it.image ? (
              <img src={proxiedImage(it.image, it.url)} alt="" loading="lazy" className="aspect-square w-full bg-zinc-100 object-cover" />
            ) : (
              <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-800" />
            )}
            <div className="px-3 py-2.5">
              <span className="text-[11px] text-zinc-500">{nameOf(it.site)}</span>
              <p className="my-1 line-clamp-2 text-[13px] leading-snug" title={it.title}>
                {it.title || "(無標題)"}
              </p>
              <p className="font-semibold text-brand">{it.price != null ? `${it.currency ?? "$"}${it.price.toLocaleString()}` : "—"}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
