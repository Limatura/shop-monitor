import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Tooltip } from "@base-ui/react/tooltip";
import { Globe, PanelLeft, ScrollText, Search, Settings as SettingsIcon } from "lucide-react";
import { api, type PluginList, type Settings } from "./lib/api";
import { useSearch } from "./lib/use-search";
import { useLogs } from "./lib/use-logs";
import { LogsPage } from "./pages/logs-page";
import { Sidebar, type NavItem } from "./components/sidebar";
import { button } from "./components/ui";
import { SearchPage } from "./pages/search-page";
import { SitesPage } from "./pages/sites-page";
import { SettingsPage } from "./pages/settings-page";
import "./app.css";

type Page = "search" | "sites" | "logs" | "settings";

const NAV: NavItem<Page>[] = [
  { key: "search", label: "商品搜尋", icon: Search },
  { key: "sites", label: "網站與登入", icon: Globe },
  { key: "logs", label: "執行日誌", icon: ScrollText },
  { key: "settings", label: "系統設定", icon: SettingsIcon },
];

const readCollapsed = () => {
  try {
    return localStorage.getItem("sidebar-collapsed") === "1";
  } catch {
    return false;
  }
};

export default function App() {
  const [page, setPage] = useState<Page>("search");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [connected, setConnected] = useState(false);
  const [list, setList] = useState<PluginList>({ plugins: [], errors: [], dir: "" });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");

  const loadPlugins = () => api.listPlugins().then(setList).catch((e) => setError(String(e)));

  useEffect(() => {
    loadPlugins();
    api.getSettings().then(setSettings);
    api.extStatus().then(setConnected);
    const un = listen<boolean>("ext-status", (e) => setConnected(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const ids = list.plugins.map((p) => p.id);
  const logs = useLogs();
  const search = useSearch(settings ? (settings.defaultSites ?? ids).filter((id) => ids.includes(id)) : []);

  return (
    <Tooltip.Provider delay={300}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar items={NAV} active={page} onSelect={setPage} collapsed={collapsed} connected={connected} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
            <button type="button" className={button.ghost} onClick={toggleSidebar} aria-label="切換側邊欄">
              <PanelLeft className="size-4" />
            </button>
            <span className="h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
            <span className="text-sm text-zinc-500">{NAV.find((n) => n.key === page)?.label}</span>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl p-6">
              {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
              {page === "search" && <SearchPage plugins={list.plugins} connected={connected} search={search} />}
              {page === "sites" && (
                <SitesPage list={list} connected={connected} reload={loadPlugins} onError={setError} />
              )}
              {page === "logs" && <LogsPage logs={logs.logs} clear={logs.clear} plugins={list.plugins} />}
              {page === "settings" && settings && (
                <SettingsPage settings={settings} plugins={list.plugins} connected={connected} onSaved={setSettings} />
              )}
            </div>
          </main>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
