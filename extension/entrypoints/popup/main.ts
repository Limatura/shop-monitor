const chromeApi = (globalThis as any).chrome;

const $ = (id: string) => document.getElementById(id)!;

async function render() {
  const { status } = await chromeApi.storage.session.get("status");
  const connected = status === "connected";
  $("conn-dot").classList.toggle("ok", connected);
  $("conn").textContent = connected ? "桌面程式：已連線" : "桌面程式：未連線（請先開啟 Shop Monitor）";

  const userScripts = Boolean(chromeApi.userScripts?.execute);
  $("us-dot").classList.toggle("ok", userScripts);
  $("us").textContent = userScripts ? "使用者指令碼：已啟用" : "使用者指令碼：未啟用";
  $("fix").hidden = userScripts;
}

$("fix").addEventListener("click", () => {
  chromeApi.tabs.create({ url: `chrome://extensions/?id=${chromeApi.runtime.id}` });
});

chromeApi.storage.session.onChanged.addListener(render);
render();
