import { type Task, wrapPlugin } from "@/utils/wrap";

const PORT = 17890;

// userScripts.execute / onUserScriptMessage are newer than the bundled typings.
const chromeApi = (globalThis as any).chrome;

type Status = "connected" | "disconnected";
type TaskReply = { ok: boolean; items?: unknown[]; error?: string; logs?: string[] };

export default defineBackground(() => {
  let ws: WebSocket | null = null;
  const waiting = new Map<string, (r: TaskReply) => void>();

  const setStatus = (status: Status) => chromeApi.storage.session.set({ status }).catch(() => {});
  const send = (msg: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  function connect() {
    if (ws && ws.readyState <= WebSocket.OPEN) return; // connecting or open
    const sock = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws = sock;
    sock.onopen = () => {
      setStatus("connected");
      send({ type: "hello", version: chromeApi.runtime.getManifest().version });
    };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      setStatus("disconnected");
      setTimeout(connect, 5000);
    };
    sock.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "ping") send({ type: "pong" });
      else if (msg.type === "open") chromeApi.tabs.create({ url: msg.url, active: true });
      else if (msg.type === "task")
        runTask(msg as Task).then((r) => send({ type: "result", taskId: msg.taskId, ...r }));
    };
  }

  /**
   * "window" mode gives each task its own unfocused normal window: the page is
   * visible, so Chrome does not throttle timers/rAF and lazy-loaded results
   * render. "tab" mode uses a background tab in the current window.
   */
  async function openPage(task: Task): Promise<{ tabId: number; windowId?: number }> {
    if (task.openMode === "window") {
      const win = await chromeApi.windows.create({
        url: task.url,
        focused: false,
        type: "normal",
        width: 1280,
        height: 900,
      });
      return { tabId: win.tabs[0].id, windowId: win.id };
    }
    const tab = await chromeApi.tabs.create({ url: task.url, active: false });
    return { tabId: tab.id };
  }

  async function runTask(task: Task): Promise<TaskReply> {
    const logs: string[] = [];
    if (!chromeApi.userScripts?.execute) {
      return {
        ok: false,
        error: "userScripts 未啟用：到擴充功能「詳細資料」開啟「允許使用者指令碼」（需 Chrome 135+）",
      };
    }
    let page: { tabId: number; windowId?: number } | undefined;
    const t0 = Date.now();
    try {
      await chromeApi.userScripts.configureWorld({ messaging: true });
      page = await openPage(task);
      await waitForLoad(page.tabId, task.timeoutMs);
      logs.push(`擴充功能：${task.openMode === "window" ? "獨立視窗" : "背景分頁"}載入完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

      const reply = new Promise<TaskReply>((resolve) => waiting.set(task.taskId, resolve));
      await chromeApi.userScripts.execute({
        target: { tabId: page.tabId },
        js: [{ code: wrapPlugin(task) }],
        world: "USER_SCRIPT",
      });
      const r = await withTimeout(reply, task.timeoutMs + 5000);
      return { ...r, logs: [...logs, ...(r.logs ?? [])] };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e), logs };
    } finally {
      waiting.delete(task.taskId);
      if (page?.windowId !== undefined) chromeApi.windows.remove(page.windowId).catch(() => {});
      else if (page) chromeApi.tabs.remove(page.tabId).catch(() => {});
    }
  }

  chromeApi.runtime.onUserScriptMessage?.addListener((msg: any) => {
    const done = msg?.__shopTask && waiting.get(msg.__shopTask);
    if (done) done({ ok: msg.ok, items: msg.items, error: msg.error, logs: msg.logs });
  });

  // The service worker can be suspended while disconnected; an alarm wakes it
  // up to retry. While connected, the app's 20s pings keep it alive.
  chromeApi.alarms.create("reconnect", { periodInMinutes: 0.5 });
  chromeApi.alarms.onAlarm.addListener(() => connect());
  chromeApi.runtime.onStartup.addListener(() => connect());
  setStatus("disconnected");
  connect();
});

function waitForLoad(tabId: number, timeoutMs: number): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve) => {
      const listener = (id: number, info: { status?: string }) => {
        if (id === tabId && info.status === "complete") {
          chromeApi.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chromeApi.tabs.onUpdated.addListener(listener);
    }),
    timeoutMs,
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("逾時")), ms)),
  ]);
}
