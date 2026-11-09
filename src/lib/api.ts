import { invoke } from "@tauri-apps/api/core";

export interface Plugin {
  id: string;
  name: string;
  search: string;
  login: string | null;
  wait: string | null;
  timeoutMs: number;
  pageStart: number;
  file: string;
}

export interface PluginList {
  plugins: Plugin[];
  errors: string[];
  dir: string;
}

export interface Settings {
  maxPages: number;
  pageDelayMs: number;
  defaultSites: string[] | null;
  openMode: "window" | "tab";
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  site: string | null;
  msg: string;
}

export interface Item {
  id?: string;
  title: string;
  price: number | null;
  /** Price symbol; "$" (TWD) when omitted. */
  currency?: string;
  url: string;
  image: string | null;
}

export interface SiteResult {
  searchId: string;
  site: string;
  page: number;
  done: boolean;
  ok: boolean;
  items: Item[];
  error: string | null;
}

export const api = {
  listPlugins: () => invoke<PluginList>("list_plugins"),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  extStatus: () => invoke<boolean>("ext_status"),
  openInBrowser: (url: string) => invoke<void>("open_in_browser", { url }),
  openPluginDir: () => invoke<void>("open_plugin_dir"),
  getLogs: () => invoke<LogEntry[]>("get_logs"),
  clearLogs: () => invoke<void>("clear_logs"),
  openLogDir: () => invoke<void>("open_log_dir"),
  search: (searchId: string, query: string, sites: string[]) =>
    invoke<void>("search", { searchId, query, sites }),
};
