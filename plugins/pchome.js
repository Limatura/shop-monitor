// ==ShopPlugin==
// @id       pchome
// @name     PChome 24h
// @version  3
// @search   https://24h.pchome.com.tw/search/{query}?p={page}
// @pageStart 1
// @login    https://ecvip.pchome.com.tw/
// @timeout  45000
// ==/ShopPlugin==

// PChome 商品網址格式：/prod/{商品代碼}，例如 /prod/DYAJ8B-A900GQ7XY，一頁 45 筆
const LINK = 'a[href*="/prod/"]';
const ID = /\/prod\/[A-Z0-9-]+/i;

await ctx.waitFor(LINK);
await ctx.scrollUntilStable(LINK, ID, { expected: 45 });

const items = ctx.collect(LINK, ID);
if (items.length < 45) ctx.log(`注意：只有 ${items.length} 筆，PChome 一頁通常是 45 筆（最後一頁除外）`);
return items;
