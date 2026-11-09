//! Log center: keeps recent entries in memory for the UI, streams new ones as
//! `log` events, and appends everything to a daily file under the app log dir.

use std::{
    collections::VecDeque,
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const MAX_ENTRIES: usize = 2000;

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: u64,
    /// Unix time in milliseconds.
    pub ts: u64,
    pub level: Level,
    pub site: Option<String>,
    pub msg: String,
}

#[derive(Default)]
pub struct Logs {
    inner: Mutex<(u64, VecDeque<LogEntry>)>,
}

pub fn dir(app: &AppHandle) -> PathBuf {
    app.path().app_log_dir().unwrap_or_else(|_| PathBuf::from("logs"))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Civil date (UTC) for a unix day number; avoids pulling in a date crate.
fn ymd(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

impl Logs {
    pub fn all(&self) -> Vec<LogEntry> {
        self.inner.lock().map(|g| g.1.iter().cloned().collect()).unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut g) = self.inner.lock() {
            g.1.clear();
        }
    }

    pub fn push(&self, app: &AppHandle, level: Level, site: Option<&str>, msg: impl Into<String>) {
        let msg = msg.into();
        let ts = now_ms();
        let entry = {
            let Ok(mut g) = self.inner.lock() else { return };
            g.0 += 1;
            let e = LogEntry { id: g.0, ts, level, site: site.map(str::to_owned), msg };
            if g.1.len() >= MAX_ENTRIES {
                g.1.pop_front();
            }
            g.1.push_back(e.clone());
            e
        };
        let _ = app.emit("log", &entry);

        // Daily file, UTC timestamps.
        let secs = (ts / 1000) as i64;
        let (y, m, d) = ymd(secs.div_euclid(86_400));
        let t = secs.rem_euclid(86_400);
        let dir = dir(app);
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(dir.join(format!("{y:04}-{m:02}-{d:02}.log"))) {
            let _ = writeln!(
                f,
                "{:02}:{:02}:{:02}Z {:<5} [{}] {}",
                t / 3600,
                t / 60 % 60,
                t % 60,
                format!("{level:?}").to_uppercase(),
                entry.site.as_deref().unwrap_or("-"),
                entry.msg
            );
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn civil_date() {
        assert_eq!(super::ymd(0), (1970, 1, 1));
        assert_eq!(super::ymd(20_766), (2026, 11, 9));
    }
}
