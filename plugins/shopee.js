// ==ShopPlugin==
// @id       shopee
// @name     蝦皮購物
// @version  3
// @search   https://shopee.tw/search?keyword={query}&page={page}
// @pageStart 0
// @login    https://shopee.tw/buyer/login
// @timeout  45000
// ==/ShopPlugin==

// 被導去登入或驗證頁就直接回報，不要空等
if (/\/buyer\/login|\/verify\//.test(location.pathname)) {
  throw new Error("需要登入或人機驗證，請先按「登入」在瀏覽器完成");
}

// 蝦皮商品網址格式：/商品名-i.{shopId}.{itemId}，一頁 60 筆
const LINK = 'a[href*="-i."]';
const ID = /-i\.\d+\.\d+/;

await ctx.waitFor(LINK);
await ctx.scrollUntilStable(LINK, ID, { expected: 60 });

const items = ctx.collect(LINK, ID);
if (items.length < 60) ctx.log(`注意：只有 ${items.length} 筆，蝦皮一頁通常是 60 筆（最後一頁除外）`);
return items;
