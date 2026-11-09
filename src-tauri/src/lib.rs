mod bridge;
mod imgproxy;
mod logs;
mod plugins;
mod settings;

use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};

use bridge::{Bridge, ToExt};
use logs::{Level, LogEntry, Logs};
use serde::Serialize;
use serde_json::Value;
use settings::Settings;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginList {
    plugins: Vec<plugins::Plugin>,
    errors: Vec<String>,
    dir: String,
}

/// One page of one site. `items` only holds items not seen on earlier pages.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SiteResult {
    search_id: String,
    site: String,
    /// 1-based page number this event belongs to.
    page: u32,
    /// True on the site's last event for this search.
    done: bool,
    ok: bool,
    items: Vec<Value>,
    error: Option<String>,
}

#[tauri::command]
fn list_plugins(app: AppHandle) -> PluginList {
    let (plugins, errors) = plugins::load_all(&app);
    PluginList { plugins, errors, dir: plugins::dir(&app).display().to_string() }
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    settings::load(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    settings::save(&app, settings)
}

#[tauri::command]
async fn ext_status(bridge: State<'_, Arc<Bridge>>) -> Result<bool, ()> {
    Ok(bridge.connected().await)
}

/// Opens a URL in the user's own browser through the extension (for logging in).
#[tauri::command]
async fn open_in_browser(url: String, bridge: State<'_, Arc<Bridge>>) -> Result<(), String> {
    bridge.send(ToExt::Open { url }).await
}

#[tauri::command]
fn open_plugin_dir(app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_path(plugins::dir(&app).display().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_logs(logs: State<'_, Logs>) -> Vec<LogEntry> {
    logs.all()
}

#[tauri::command]
fn clear_logs(logs: State<'_, Logs>) {
    logs.clear();
}

#[tauri::command]
fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let dir = logs::dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

fn item_key(v: &Value) -> Option<String> {
    v.get("id").or_else(|| v.get("url")).and_then(Value::as_str).map(str::to_owned)
}

/// Loads up to `max_pages` pages of one site, one after another, emitting a
/// `search-site` event per page. Stops early when a page has nothing new.
async fn search_site(app: AppHandle, bridge: Arc<Bridge>, p: plugins::Plugin, search_id: String, query: String, cfg: Settings) {
    let logs = app.state::<Logs>();
    let log = |level, msg: String| logs.push(&app, level, Some(&p.id), msg);
    let pages = if p.paged() { cfg.max_pages } else { 1 };
    let mut seen = HashSet::new();
    for i in 0..pages {
        if i > 0 {
            tokio::time::sleep(Duration::from_millis(cfg.page_delay_ms)).await;
        }
        let url = p.search_url(&query, i);
        log(Level::Info, format!("第 {} 頁開始：{url}", i + 1));
        let started = Instant::now();
        let out = bridge
            .run_task(ToExt::Task {
                task_id: uuid::Uuid::new_v4().to_string(),
                query: query.clone(),
                url,
                wait: p.wait.clone(),
                code: p.code.clone(),
                timeout_ms: p.timeout_ms,
                open_mode: cfg.open_mode.clone(),
            })
            .await;
        for line in &out.logs {
            log(Level::Debug, format!("第 {} 頁｜{line}", i + 1));
        }
        let r = out.result;
        let mut ev = SiteResult {
            search_id: search_id.clone(),
            site: p.id.clone(),
            page: i + 1,
            done: false,
            ok: true,
            items: vec![],
            error: None,
        };
        match r {
            Ok(items) => {
                let total = items.len();
                ev.items = items
                    .into_iter()
                    .filter(|v| item_key(v).is_none_or(|k| seen.insert(k)))
                    .collect();
                ev.done = ev.items.is_empty() || i + 1 == pages;
                let no_price = ev.items.iter().filter(|v| v.get("price").is_none_or(Value::is_null)).count();
                let level = if total == 0 { Level::Warn } else { Level::Info };
                log(
                    level,
                    format!(
                        "第 {} 頁完成：抓到 {total} 筆，新增 {} 筆，無價格 {no_price} 筆，耗時 {:.1}s",
                        i + 1,
                        ev.items.len(),
                        started.elapsed().as_secs_f32()
                    ),
                );
                if ev.items.is_empty() && i + 1 < pages {
                    log(Level::Info, "沒有新商品，停止換頁".into());
                }
            }
            Err(e) => {
                log(Level::Error, format!("第 {} 頁失敗：{e}", i + 1));
                ev.ok = false;
                ev.error = Some(e);
                ev.done = true;
            }
        }
        let done = ev.done;
        let _ = app.emit("search-site", ev);
        if done {
            break;
        }
    }
}

/// Runs the query on every selected site in parallel (pages within a site run
/// one at a time). Results stream to the UI as `search-site` events.
#[tauri::command]
async fn search(
    app: AppHandle,
    bridge: State<'_, Arc<Bridge>>,
    search_id: String,
    query: String,
    sites: Vec<String>,
) -> Result<(), String> {
    if !bridge.connected().await {
        return Err("瀏覽器擴充功能尚未連線".into());
    }
    let cfg = settings::load(&app);
    let (all, _) = plugins::load_all(&app);
    app.state::<Logs>().push(
        &app,
        Level::Info,
        None,
        format!("搜尋「{query}」：{}，每站最多 {} 頁，模式 {}", sites.join(", "), cfg.max_pages, cfg.open_mode),
    );
    let jobs = all
        .into_iter()
        .filter(|p| sites.contains(&p.id))
        .map(|p| search_site(app.clone(), bridge.inner().clone(), p, search_id.clone(), query.clone(), cfg.clone()));
    futures_util::future::join_all(jobs).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge = Arc::new(Bridge::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(bridge.clone())
        .manage(Logs::default())
        .register_asynchronous_uri_scheme_protocol("imgproxy", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                responder.respond(imgproxy::handle(app, request).await);
            });
        })
        .setup(move |app| {
            app.state::<Logs>().push(app.handle(), Level::Info, None, "Shop Monitor 啟動");
            plugins::ensure_defaults(app.handle());
            bridge::start(app.handle().clone(), bridge);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_plugins,
            get_settings,
            save_settings,
            ext_status,
            open_in_browser,
            open_plugin_dir,
            get_logs,
            clear_logs,
            open_log_dir,
            search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
