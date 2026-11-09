import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type LogEntry } from "./api";

const MAX = 2000;

/** Log entries: initial backlog from the backend, then live `log` events. */
export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    let backlogLoaded = false;
    const early: LogEntry[] = [];
    const un = listen<LogEntry>("log", ({ payload }) => {
      if (!backlogLoaded) early.push(payload);
      else setLogs((prev) => [...prev.slice(-(MAX - 1)), payload]);
    });
    api.getLogs().then((backlog) => {
      backlogLoaded = true;
      const last = backlog.length ? backlog[backlog.length - 1].id : 0;
      setLogs([...backlog, ...early.filter((e) => e.id > last)].slice(-MAX));
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const clear = async () => {
    await api.clearLogs();
    setLogs([]);
  };

  return { logs, clear };
}
