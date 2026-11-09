//! App settings, stored as JSON in the app config dir.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// How many result pages to load per site (only for plugins whose
    /// `@search` URL contains `{page}`).
    pub max_pages: u32,
    /// Pause between pages of the same site, to look less like a bot.
    pub page_delay_ms: u64,
    /// Sites ticked by default on the search page; `None` means all.
    pub default_sites: Option<Vec<String>>,
    /// "window": each task gets its own unfocused window, so the page renders
    /// at full speed. "tab": background tab (quieter, but Chrome throttles it
    /// and lazy-loaded results may not appear).
    pub open_mode: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self { max_pages: 2, page_delay_ms: 1500, default_sites: None, open_mode: "window".into() }
    }
}

impl Settings {
    fn clamp(mut self) -> Self {
        if self.open_mode != "tab" {
            self.open_mode = "window".into();
        }
        self.max_pages = self.max_pages.clamp(1, 20);
        self.page_delay_ms = self.page_delay_ms.min(60_000);
        self
    }
}

fn path(app: &AppHandle) -> PathBuf {
    app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from(".")).join("settings.json")
}

pub fn load(app: &AppHandle) -> Settings {
    fs::read_to_string(path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .unwrap_or_default()
        .clamp()
}

pub fn save(app: &AppHandle, s: Settings) -> Result<Settings, String> {
    let s = s.clamp();
    let p = path(app);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    fs::write(p, json).map_err(|e| e.to_string())?;
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_json_uses_defaults() {
        let s: Settings = serde_json::from_str(r#"{"maxPages": 99}"#).unwrap();
        let s = s.clamp();
        assert_eq!(s.max_pages, 20);
        assert_eq!(s.page_delay_ms, 1500);
    }
}
