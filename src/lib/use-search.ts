import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type Item, type SiteResult } from "./api";

export interface SiteProgress {
  loading: boolean;
  /** Pages finished so far. */
  page: number;
  count: number;
  error: string | null;
}

/**
 * Search state lives above the pages, so switching to Settings and back keeps
 * the query and results.
 */
export function useSearch(initialSites: string[]) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sites, setSites] = useState<Record<string, SiteProgress>>({});
  const [results, setResults] = useState<(Item & { site: string })[]>([]);
  const [error, setError] = useState("");
  const searchId = useRef("");

  // Apply default site selection once plugins/settings are known.
  const initKey = initialSites.join(",");
  useEffect(() => {
    if (initialSites.length) setSelected((prev) => (prev.size ? prev : new Set(initialSites)));
  }, [initKey]);

  useEffect(() => {
    const un = listen<SiteResult>("search-site", ({ payload: r }) => {
      if (r.searchId !== searchId.current) return; // straggler from an older search
      setSites((s) => {
        const prev = s[r.site] ?? { loading: true, page: 0, count: 0, error: null };
        return {
          ...s,
          [r.site]: {
            loading: !r.done,
            page: r.page,
            count: prev.count + r.items.length,
            error: r.ok ? null : r.error ?? "失敗",
          },
        };
      });
      if (r.items.length) setResults((prev) => [...prev, ...r.items.map((i) => ({ ...i, site: r.site }))]);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const run = async () => {
    const q = query.trim();
    if (!q || !selected.size) return;
    const id = crypto.randomUUID();
    searchId.current = id;
    setResults([]);
    setError("");
    setSites(Object.fromEntries([...selected].map((s) => [s, { loading: true, page: 0, count: 0, error: null }])));
    try {
      await api.search(id, q, [...selected]);
    } catch (err) {
      setError(String(err));
      setSites({});
    }
  };

  const busy = Object.values(sites).some((s) => s.loading);
  return { query, setQuery, selected, setSelected, sites, results, error, busy, run };
}

export type SearchState = ReturnType<typeof useSearch>;
