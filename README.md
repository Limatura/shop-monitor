# Shop Monitor

One search box, many shops (Shopee, PChome, …). Searches run inside your own
Chrome/Edge through a companion extension, so they use your real login and
browser fingerprint.

```
Tauri app (Rust)  ◀── ws://127.0.0.1:17890 ──▶  browser extension (MV3)
  plugins/*.js                                    opens background tab, runs the
  search UI                                       plugin via chrome.userScripts
```

## Setup

1. `pnpm install && pnpm tauri dev`
2. `cd extension && pnpm install && pnpm build`
3. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick `extension/.output/chrome-mv3`.
4. Open the extension's **Details** page and turn on **Allow User Scripts**.
5. Click **登入** next to each site in the app and log in yourself in the browser.

## Plugins

Plugins live in the app config dir, e.g. `%APPDATA%\com.limatura.shop-monitor\plugins`
(the app has an "開啟外掛資料夾" button). Defaults are copied there on first run; see
`plugins/*.js` for the format. The body is an async function that gets `ctx`
(`waitFor`, `scroll`, `sleep`, `price`, `collect`, `query`) and returns
`[{ title, price, url, image }]`.
