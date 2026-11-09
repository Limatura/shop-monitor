// ==ShopPlugin==
// @id       taobao
// @name     淘寶
// @version  1
// @search   https://s.taobao.com/search?q={query}&page={page}
// @pageStart 1
// @login    https://login.taobao.com/
// @timeout  60000
// ==/ShopPlugin==

// 參考 jackwener/OpenCLI 的 clis/taobao/search.js 與 page-state.js（2026-10 仍在維護）。
// 淘寶搜尋頁的 class 名稱是 CSS Modules 產生的（例如 doubleCard--a1b2c），
// 所以用 [class*="前綴--"] 比對，雜湊值變了也能抓到。
// 注意：分頁參數 page={page} 尚未在線上確認；另有舊版是 s=(頁數-1)*44 的寫法。

// --- 登入／人機驗證檢查（淘寶沒登入通常會被導去登入或滑塊驗證） ---
const blocked =
  /(?:^|\/)(?:punish|captcha|verify)(?:\/|$)/i.test(location.pathname) ||
  /[?&](_____tmd_____|x5sec)=/.test(location.search) ||
  /安全验证|滑块验证|访问受限|账号异常|账户异常/.test(document.title) ||
  [...document.querySelectorAll("#nocaptcha, #nc_1_wrapper, #baxia-dialog-content")].some(
    (n) => n.getBoundingClientRect().width > 0,
  );
if (blocked) throw new Error("淘寶要求安全驗證（滑塊），請在瀏覽器手動完成後再搜尋");
if (/^(?:login|passport)\./.test(location.hostname) || /^(?:登录|登入)/.test(document.title)) {
  throw new Error("淘寶需要登入，請先按「登入」在瀏覽器完成");
}

const CARD = '[class*="doubleCard--"]';
await ctx.waitFor(CARD);

// 一直捲到卡片數量不再增加。scrollUntilStable 用連結 id 計數，淘寶卡片的連結
// 不一定帶 id，所以這裡自己數卡片。
let last = -1;
for (let i = 0, still = 0; i < 30 && still < 2; i++) {
  window.scrollBy(0, window.innerHeight * 0.8);
  await ctx.sleep(800);
  const n = document.querySelectorAll(CARD).length;
  const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
  still = n === last && atBottom ? still + 1 : 0;
  last = n;
}
ctx.log("卡片數", last);

const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

/** 商品 id：先找卡片內/外層 <a> 的 id= 參數，再找外層的 data-spm-act-id。 */
function itemIdOf(card) {
  const links = [card.closest("a"), ...card.querySelectorAll("a")].filter(Boolean);
  for (const a of links) {
    const m = String(a.href).match(/[?&]id=(\d{6,})/);
    if (m) return m[1];
  }
  for (let el = card, i = 0; el && i < 4; el = el.parentElement, i++) {
    const v = el.getAttribute("data-spm-act-id");
    if (v && /^\d{10,}$/.test(v)) return v;
  }
  return null;
}

const items = [];
const seen = new Set();
for (const card of document.querySelectorAll(CARD)) {
  const title = text(card.querySelector('[class*="title--"]'));
  if (title.length < 3) continue;
  const id = itemIdOf(card);
  const key = id ?? title;
  if (seen.has(key)) continue;
  seen.add(key);

  const int = text(card.querySelector('[class*="priceInt--"]'));
  const frac = text(card.querySelector('[class*="priceFloat--"]'));
  const price = int ? Number((int + frac).replace(/[^\d.]/g, "")) : null;

  // 天貓商品的 <a> 會指向 detail.tmall.com，優先用頁面上的真實連結
  const href = [card.closest("a"), ...card.querySelectorAll("a")]
    .filter(Boolean)
    .map((a) => a.href)
    .find((h) => /item\.taobao\.com|detail\.tmall\.com/.test(h));

  items.push({
    id: id ?? undefined,
    title: title.slice(0, 120),
    price: Number.isFinite(price) ? price : null,
    currency: "¥",
    url: href ? href.split("&")[0] : id ? `https://item.taobao.com/item.htm?id=${id}` : location.href,
    image: ctx.imageOf(card.closest("a") ?? card),
    shop: text(card.querySelector('[class*="shopName--"]')).replace(/^\d+年老店/, ""),
    sales: text(card.querySelector('[class*="realSales--"]')),
  });
}

ctx.log(`商品 ${items.length} 筆，無 id ${items.filter((x) => !x.id).length} 筆，無價格 ${items.filter((x) => x.price == null).length} 筆`);
return items;
