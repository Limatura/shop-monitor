//! Image proxy served on the `imgproxy` URI scheme.
//!
//! Shop image CDNs often reject hot-linked requests (wrong/missing Referer).
//! The webview loads `imgproxy://localhost/?u=<image>&r=<referer>` (on Windows:
//! `http://imgproxy.localhost/...`); we fetch the image server-side with the
//! shop's Referer and a browser User-Agent, and cache it on disk.

use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::PathBuf,
    sync::OnceLock,
    time::Duration,
};

use tauri::{
    AppHandle, Manager,
    http::{Request, Response, StatusCode, header},
};

use crate::logs::{Level, Logs};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const MAX_BYTES: usize = 10 * 1024 * 1024;

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(UA)
            .timeout(Duration::from_secs(20))
            .build()
            .expect("http client")
    })
}

fn query_param(uri: &str, key: &str) -> Option<String> {
    let q = uri.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| urlencoding::decode(v).ok().map(|s| s.into_owned())).flatten()
    })
}

fn is_http(u: &str) -> bool {
    u.starts_with("https://") || u.starts_with("http://")
}

fn cache_path(app: &AppHandle, url: &str) -> Option<PathBuf> {
    let mut h = DefaultHasher::new();
    url.hash(&mut h);
    let dir = app.path().app_cache_dir().ok()?.join("img");
    Some(dir.join(format!("{:016x}", h.finish())))
}

fn error(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

fn image(bytes: Vec<u8>, content_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "max-age=86400")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(bytes)
        .unwrap()
}

/// Cached files store the content type on the first line, then the bytes.
fn read_cache(path: &PathBuf) -> Option<(String, Vec<u8>)> {
    let data = std::fs::read(path).ok()?;
    let nl = data.iter().position(|&b| b == b'\n')?;
    let ct = String::from_utf8(data[..nl].to_vec()).ok()?;
    Some((ct, data[nl + 1..].to_vec()))
}

fn write_cache(path: &PathBuf, ct: &str, bytes: &[u8]) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let mut data = Vec::with_capacity(ct.len() + 1 + bytes.len());
    data.extend_from_slice(ct.as_bytes());
    data.push(b'\n');
    data.extend_from_slice(bytes);
    let _ = std::fs::write(path, data);
}

pub async fn handle(app: AppHandle, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();
    let Some(url) = query_param(&uri, "u").filter(|u| is_http(u)) else {
        return error(StatusCode::BAD_REQUEST, "missing or invalid u");
    };
    let referer = query_param(&uri, "r").filter(|r| is_http(r));

    let cache = cache_path(&app, &url);
    if let Some((ct, bytes)) = cache.as_ref().and_then(read_cache) {
        return image(bytes, &ct);
    }

    let mut rq = client().get(&url).header(header::ACCEPT, "image/avif,image/webp,image/*,*/*;q=0.8");
    if let Some(r) = &referer {
        rq = rq.header(header::REFERER, r);
    }
    let log_fail = |msg: String| {
        if let Some(logs) = app.try_state::<Logs>() {
            logs.push(&app, Level::Warn, None, format!("圖片代理失敗：{msg}｜{url}"));
        }
    };

    let resp = match rq.send().await {
        Ok(r) => r,
        Err(e) => {
            log_fail(e.to_string());
            return error(StatusCode::BAD_GATEWAY, "fetch failed");
        }
    };
    let status = resp.status();
    let ct = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !status.is_success() {
        log_fail(format!("HTTP {status}"));
        return error(StatusCode::BAD_GATEWAY, "upstream error");
    }
    // Only ever relay images, so the scheme cannot be used to read arbitrary pages.
    if !ct.starts_with("image/") {
        log_fail(format!("不是圖片（{ct}）"));
        return error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "not an image");
    }
    let bytes = match resp.bytes().await {
        Ok(b) if b.len() <= MAX_BYTES => b.to_vec(),
        Ok(_) => return error(StatusCode::PAYLOAD_TOO_LARGE, "too large"),
        Err(e) => {
            log_fail(e.to_string());
            return error(StatusCode::BAD_GATEWAY, "read failed");
        }
    };
    if let Some(p) = &cache {
        write_cache(p, &ct, &bytes);
    }
    image(bytes, &ct)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_params() {
        let u = "http://imgproxy.localhost/?u=https%3A%2F%2Fcf.shopee.tw%2Ffile%2Fabc&r=https%3A%2F%2Fshopee.tw%2F";
        assert_eq!(query_param(u, "u").as_deref(), Some("https://cf.shopee.tw/file/abc"));
        assert_eq!(query_param(u, "r").as_deref(), Some("https://shopee.tw/"));
        assert_eq!(query_param(u, "x"), None);
        assert!(!is_http("file:///C:/secret"));
    }
}
