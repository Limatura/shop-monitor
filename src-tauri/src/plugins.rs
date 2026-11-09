//! Site plugins: userscript-style JS files with a metadata header.
//!
//! ```js
//! // ==ShopPlugin==
//! // @id       pchome
//! // @name     PChome 24h
//! // @version  2                       (optional: bump to upgrade bundled copies)
//! // @search   https://24h.pchome.com.tw/search/{query}?p={page}
//! // @pageStart 1                      (optional: number of the first page, default 1)
//! // @login    https://ecvip.pchome.com.tw/
//! // @wait     a[href*="/prod/"]       (optional CSS selector to wait for)
//! // @timeout  30000                   (optional, ms)
//! // ==/ShopPlugin==
//! // The rest of the file is an async function body. It gets `ctx` (helpers)
//! // and returns an array of { title, price, url, image }.
//! ```

use std::{fs, path::PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const DEFAULTS: &[(&str, &str)] = &[
    ("shopee.js", include_str!("../../plugins/shopee.js")),
    ("pchome.js", include_str!("../../plugins/pchome.js")),
    ("taobao.js", include_str!("../../plugins/taobao.js")),
];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub search: String,
    pub login: Option<String>,
    pub wait: Option<String>,
    pub timeout_ms: u64,
    pub page_start: u32,
    /// Bundled plugins with a higher `@version` replace older copies on disk.
    pub version: u32,
    pub file: String,
    #[serde(skip)]
    pub code: String,
}

impl Plugin {
    /// Whether the search URL can address result pages.
    pub fn paged(&self) -> bool {
        self.search.contains("{page}")
    }

    /// `page_index` is 0-based; it is offset by `@pageStart`.
    pub fn search_url(&self, query: &str, page_index: u32) -> String {
        self.search
            .replace("{query}", &urlencoding::encode(query))
            .replace("{page}", &(self.page_start + page_index).to_string())
    }
}

pub fn parse(src: &str, file: &str) -> Result<Plugin, String> {
    let start = src.find("==ShopPlugin==").ok_or("缺少 // ==ShopPlugin== 標頭")?;
    let end = src.find("==/ShopPlugin==").ok_or("缺少 // ==/ShopPlugin== 結尾")?;
    let header = &src[start..end];
    let body_start = src[end..].find('\n').map(|i| end + i + 1).unwrap_or(src.len());

    let (mut id, mut name, mut search) = (None, None, None);
    let (mut login, mut wait, mut timeout_ms, mut page_start, mut version) = (None, None, 30_000, 1, 0);
    for line in header.lines() {
        let line = line.trim().trim_start_matches("//").trim();
        let Some(rest) = line.strip_prefix('@') else { continue };
        let (key, val) = rest.split_once(char::is_whitespace).unwrap_or((rest, ""));
        let val = val.trim().to_string();
        match key {
            "id" => id = Some(val),
            "name" => name = Some(val),
            "search" => search = Some(val),
            "login" => login = Some(val),
            "wait" => wait = Some(val),
            "timeout" => {
                timeout_ms = val.parse().map_err(|_| format!("@timeout 不是數字: {val}"))?
            }
            "pageStart" => {
                page_start = val.parse().map_err(|_| format!("@pageStart 不是數字: {val}"))?
            }
            "version" => version = val.parse().map_err(|_| format!("@version 不是整數: {val}"))?,
            _ => {}
        }
    }
    let id = id.ok_or("缺少 @id")?;
    Ok(Plugin {
        name: name.unwrap_or_else(|| id.clone()),
        id,
        search: search.ok_or("缺少 @search")?,
        login,
        wait,
        timeout_ms,
        page_start,
        version,
        file: file.to_string(),
        code: src[body_start..].to_string(),
    })
}

pub fn dir(app: &AppHandle) -> PathBuf {
    app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from(".")).join("plugins")
}

/// Installs bundled plugins that are missing, and upgrades copies whose
/// `@version` is older than the bundled one. The replaced file is kept as
/// `<name>.bak` so local edits are not lost.
pub fn ensure_defaults(app: &AppHandle) {
    let dir = dir(app);
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    for (name, src) in DEFAULTS {
        let path = dir.join(name);
        if path.exists() {
            let bundled = parse(src, name).map(|p| p.version).unwrap_or(0);
            let installed = fs::read_to_string(&path)
                .ok()
                .and_then(|s| parse(&s, name).ok())
                .map(|p| p.version)
                .unwrap_or(0);
            if installed >= bundled {
                continue;
            }
            let _ = fs::rename(&path, dir.join(format!("{name}.bak")));
        }
        let _ = fs::write(path, src);
    }
}

pub fn load_all(app: &AppHandle) -> (Vec<Plugin>, Vec<String>) {
    let (mut ok, mut errs) = (Vec::new(), Vec::new());
    let Ok(entries) = fs::read_dir(dir(app)) else { return (ok, errs) };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("js") {
            continue;
        }
        let file = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        match fs::read_to_string(&path).map_err(|e| e.to_string()).and_then(|s| parse(&s, &file)) {
            Ok(p) => ok.push(p),
            Err(e) => errs.push(format!("{file}: {e}")),
        }
    }
    ok.sort_by(|a, b| a.id.cmp(&b.id));
    (ok, errs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_defaults() {
        for (file, src) in DEFAULTS {
            let p = parse(src, file).unwrap();
            assert!(p.search.contains("{query}"));
            assert!(p.code.contains("return"));
            assert!(!p.code.contains("==/ShopPlugin=="));
        }
    }

    #[test]
    fn encodes_query() {
        let p = parse(DEFAULTS[1].1, "pchome.js").unwrap();
        assert_eq!(p.search_url("iphone 16", 1), "https://24h.pchome.com.tw/search/iphone%2016?p=2");
    }

    #[test]
    fn shopee_pages_are_zero_based() {
        let p = parse(DEFAULTS[0].1, "shopee.js").unwrap();
        assert!(p.paged());
        assert!(p.search_url("x", 0).ends_with("&page=0"));
        assert!(p.search_url("x", 1).ends_with("&page=1")); // second page
        assert_eq!(p.version, 3);
    }

    #[test]
    fn rejects_missing_header() {
        assert!(parse("return [];", "x.js").is_err());
    }
}
