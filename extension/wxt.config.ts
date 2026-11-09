import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Shop Monitor Bridge",
    description: "讓 Shop Monitor 桌面程式在你的瀏覽器裡執行站點外掛腳本",
    minimum_chrome_version: "135", // chrome.userScripts.execute
    permissions: ["userScripts", "tabs", "storage", "alarms"],
    host_permissions: ["<all_urls>"],
  },
});
