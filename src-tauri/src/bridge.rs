//! WebSocket bridge between the app and the browser extension.
//! The app listens on 127.0.0.1; the extension connects as the client.

use std::{collections::HashMap, sync::Arc, time::Duration};

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::logs::{Level, Logs};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{Mutex, mpsc, oneshot},
};
use tokio_tungstenite::tungstenite::{
    Message,
    handshake::server::{ErrorResponse, Request, Response},
    http::StatusCode,
};

pub const PORT: u16 = 17890;

fn log(app: &AppHandle, level: Level, msg: impl Into<String>) {
    if let Some(logs) = app.try_state::<Logs>() {
        logs.push(app, level, None, msg);
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ToExt {
    Task {
        task_id: String,
        query: String,
        url: String,
        wait: Option<String>,
        code: String,
        timeout_ms: u64,
        /// "window" (own unfocused window, not throttled) or "tab" (background tab).
        open_mode: String,
    },
    Open {
        url: String,
    },
    Ping,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum FromExt {
    Hello {
        version: Option<String>,
    },
    Result {
        task_id: String,
        ok: bool,
        items: Option<Vec<Value>>,
        error: Option<String>,
        logs: Option<Vec<String>>,
    },
    Pong,
}

/// Outcome of one task plus the log lines the plugin wrote while running.
pub struct TaskOutput {
    pub result: Result<Vec<Value>, String>,
    pub logs: Vec<String>,
}

type TaskResult = TaskOutput;

impl TaskOutput {
    fn err(e: impl Into<String>) -> Self {
        Self { result: Err(e.into()), logs: vec![] }
    }
}

#[derive(Default)]
pub struct Bridge {
    tx: Mutex<Option<mpsc::UnboundedSender<ToExt>>>,
    pending: Mutex<HashMap<String, oneshot::Sender<TaskResult>>>,
}

impl Bridge {
    pub async fn connected(&self) -> bool {
        self.tx.lock().await.as_ref().is_some_and(|t| !t.is_closed())
    }

    pub async fn send(&self, msg: ToExt) -> Result<(), String> {
        match self.tx.lock().await.as_ref() {
            Some(tx) => tx.send(msg).map_err(|_| "擴充功能連線已中斷".to_string()),
            None => Err("瀏覽器擴充功能尚未連線".to_string()),
        }
    }

    pub async fn run_task(&self, task: ToExt) -> TaskResult {
        let ToExt::Task { task_id, timeout_ms, .. } = &task else {
            return TaskOutput::err("not a task");
        };
        let (task_id, timeout_ms) = (task_id.clone(), *timeout_ms);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(task_id.clone(), tx);

        if let Err(e) = self.send(task).await {
            self.pending.lock().await.remove(&task_id);
            return TaskOutput::err(e);
        }

        // Extra slack on top of the in-page timeout for tab creation and page load.
        let res = tokio::time::timeout(Duration::from_millis(timeout_ms + 15_000), rx).await;
        self.pending.lock().await.remove(&task_id);
        match res {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => TaskOutput::err("任務被取消"),
            Err(_) => TaskOutput::err("逾時（擴充功能沒有回應）"),
        }
    }

    async fn fail_all(&self, reason: &str) {
        for (_, tx) in self.pending.lock().await.drain() {
            let _ = tx.send(TaskOutput::err(reason));
        }
    }
}

pub fn start(app: AppHandle, bridge: Arc<Bridge>) {
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind(("127.0.0.1", PORT)).await {
            Ok(l) => l,
            Err(e) => {
                log(&app, Level::Error, format!("無法監聽 127.0.0.1:{PORT}：{e}（可能已有另一個 Shop Monitor 在執行）"));
                return;
            }
        };
        loop {
            let Ok((stream, _)) = listener.accept().await else { continue };
            let (app, bridge) = (app.clone(), bridge.clone());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = handle_conn(stream, app.clone(), bridge).await {
                    log(&app, Level::Warn, format!("擴充功能連線錯誤：{e}"));
                }
            });
        }
    });
}

/// Only browser extensions may connect: ordinary web pages can reach a
/// localhost WebSocket too, so reject anything without an extension origin.
#[allow(clippy::result_large_err)] // signature required by tungstenite's handshake callback
fn check_origin(req: &Request, resp: Response) -> Result<Response, ErrorResponse> {
    let origin = req.headers().get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
    if origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://") {
        Ok(resp)
    } else {
        let mut r = ErrorResponse::new(Some("forbidden origin".into()));
        *r.status_mut() = StatusCode::FORBIDDEN;
        Err(r)
    }
}

async fn handle_conn(stream: TcpStream, app: AppHandle, bridge: Arc<Bridge>) -> Result<(), String> {
    let ws = tokio_tungstenite::accept_hdr_async(stream, check_origin)
        .await
        .map_err(|e| e.to_string())?;
    let (mut sink, mut source) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<ToExt>();
    *bridge.tx.lock().await = Some(tx.clone());
    let _ = app.emit("ext-status", true);

    // Writer: forwards queued messages and pings every 20s, which also keeps
    // the extension's MV3 service worker from being suspended.
    let writer = tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(20));
        loop {
            let msg = tokio::select! {
                m = rx.recv() => match m { Some(m) => m, None => break },
                _ = tick.tick() => ToExt::Ping,
            };
            let text = serde_json::to_string(&msg).unwrap_or_default();
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = source.next().await {
        let Ok(text) = msg.to_text() else { continue };
        if text.is_empty() {
            continue;
        }
        match serde_json::from_str::<FromExt>(text) {
            Ok(FromExt::Hello { version }) => {
                log(&app, Level::Info, format!("擴充功能已連線（版本 {}）", version.as_deref().unwrap_or("?")));
            }
            Ok(FromExt::Result { task_id, ok, items, error, logs }) => {
                if let Some(done) = bridge.pending.lock().await.remove(&task_id) {
                    let result = if ok {
                        Ok(items.unwrap_or_default())
                    } else {
                        Err(error.unwrap_or_else(|| "未知錯誤".into()))
                    };
                    let _ = done.send(TaskOutput { result, logs: logs.unwrap_or_default() });
                }
            }
            Ok(FromExt::Pong) => {}
            Err(e) => log(&app, Level::Warn, format!("無法解析擴充功能訊息：{e}")),
        }
    }

    writer.abort();
    let mut cur = bridge.tx.lock().await;
    if cur.as_ref().is_some_and(|t| t.same_channel(&tx)) {
        *cur = None;
        drop(cur);
        bridge.fail_all("擴充功能連線已中斷").await;
        let _ = app.emit("ext-status", false);
        log(&app, Level::Warn, "擴充功能已斷線");
    }
    Ok(())
}
