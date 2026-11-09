export interface Task {
  type: "task";
  taskId: string;
  query: string;
  url: string;
  wait: string | null;
  code: string;
  timeoutMs: number;
  openMode: "window" | "tab";
}

/**
 * Wraps a plugin body into a self-contained user script. It runs in the
 * USER_SCRIPT world of the page (full DOM access, isolated from page JS) and
 * reports back with chrome.runtime.sendMessage, which the background receives
 * through runtime.onUserScriptMessage. Lines passed to ctx.log end up in the
 * app's log center.
 */
export function wrapPlugin(task: Task): string {
  return `(async () => {
  const __taskId = ${JSON.stringify(task.taskId)};
  const __started = Date.now();
  const __deadline = __started + ${Number(task.timeoutMs)};
  const __logs = [];
  const __send = (m) => chrome.runtime.sendMessage({ __shopTask: __taskId, logs: __logs, ...m });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...args) => {
    const t = ((Date.now() - __started) / 1000).toFixed(1);
    __logs.push("+" + t + "s " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  const idsOf = (selector, idRe) => {
    const ids = new Set();
    for (const a of document.querySelectorAll(selector)) {
      const id = (String(a.href).match(idRe) || [])[0];
      if (id) ids.add(id);
    }
    return ids;
  };
  /** Real image URL even when the <img> is still a lazy-load placeholder. */
  const imageOf = (card) => {
    const abs = (u) => { try { return u ? new URL(u, location.href).href : null; } catch { return null; } };
    const fromSet = (s) => s && s.split(",").map((p) => p.trim().split(/\\s+/)[0]).filter(Boolean).pop();
    for (const img of card.querySelectorAll("img")) {
      const cands = [
        img.currentSrc, img.getAttribute("src"),
        img.getAttribute("data-src"), img.getAttribute("data-original"), img.getAttribute("data-lazy"),
        fromSet(img.getAttribute("srcset")), fromSet(img.getAttribute("data-srcset")),
      ];
      for (const c of cands) {
        const u = abs(c);
        if (u && /^https?:/.test(u)) return u;
      }
    }
    for (const s of card.querySelectorAll("picture source")) {
      const u = abs(fromSet(s.getAttribute("srcset")));
      if (u && /^https?:/.test(u)) return u;
    }
    // Some cards use a CSS background instead of <img>.
    for (const el of [card, ...card.querySelectorAll("[style*='background']")]) {
      const m = (el.style && el.style.backgroundImage || "").match(/url\\(["']?([^"')]+)/);
      if (m && abs(m[1])) return abs(m[1]);
    }
    return null;
  };
  const ctx = {
    query: ${JSON.stringify(task.query)},
    imageOf,
    sleep,
    log,
    /** Waits until a selector matches, or throws when the task times out. */
    async waitFor(selector) {
      while (!document.querySelector(selector)) {
        if (Date.now() > __deadline) throw new Error("等不到元素: " + selector);
        await sleep(300);
      }
      log("找到元素", selector);
      return document.querySelector(selector);
    },
    /** Scrolls down a fixed number of steps. */
    async scroll(steps = 3, delay = 600) {
      for (let i = 1; i <= steps; i++) {
        window.scrollTo(0, (document.body.scrollHeight * i) / steps);
        await sleep(delay);
      }
    },
    /**
     * Scrolls a screen at a time until the number of distinct products stops
     * growing at the bottom of the page (or expected is reached).
     */
    async scrollUntilStable(selector, idRe, { expected = Infinity, delay = 700, maxSteps = 40 } = {}) {
      let last = -1, still = 0, step = 0;
      for (; step < maxSteps && Date.now() < __deadline - 2000; step++) {
        window.scrollBy(0, Math.max(400, window.innerHeight * 0.8));
        await sleep(delay);
        const n = idsOf(selector, idRe).size;
        const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
        if (n >= expected) { last = n; break; }
        if (n === last && atBottom) { if (++still >= 2) break; } else still = 0;
        last = n;
      }
      log("捲動 " + step + " 次後商品數", last, "頁高", document.body.scrollHeight,
          document.visibilityState === "visible" ? "" : "（分頁不在前景，可能被節流）");
      return last;
    },
    /** First "$1,234"-style amount in a text, as a number. */
    price(text) {
      const m = String(text || "").replace(/\\s+/g, "").match(/\\$([\\d,]+(?:\\.\\d+)?)/);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    },
    /**
     * Generic product-card extractor: finds product links by selector, groups
     * them by the id that idRe pulls out of the href, then climbs to the largest
     * ancestor that holds only that one product and reads title/price/image.
     */
    collect(selector, idRe) {
      const idOf = (href) => (String(href).match(idRe) || [])[0];
      const links = document.querySelectorAll(selector);
      const first = new Map();
      for (const a of links) {
        const id = idOf(a.href);
        if (id && !first.has(id)) first.set(id, a);
      }
      const out = [];
      for (const [id, a] of first) {
        let card = a;
        for (let i = 0; i < 8 && card.parentElement; i++) {
          const p = card.parentElement;
          const ids = new Set([...p.querySelectorAll(selector)].map((x) => idOf(x.href)).filter(Boolean));
          if (ids.size > 1) break;
          card = p;
        }
        const text = card.innerText || "";
        const img = card.querySelector("img");
        const lines = text.split("\\n").map((s) => s.trim()).filter(Boolean);
        const words = lines.filter((l) => !/^[\\s$\\d,.%+\\-~已售件萬]+$/.test(l));
        const title = (img && img.alt && img.alt.length > 4 ? img.alt : "") ||
          words.sort((x, y) => y.length - x.length)[0] || "";
        out.push({
          id,
          title,
          price: ctx.price(text),
          url: a.href.split("?")[0],
          image: imageOf(card),
        });
      }
      log("collect: 連結 " + links.length + " 個 → 商品 " + out.length + " 筆，無價格 " +
          out.filter((x) => x.price == null).length + " 筆，無圖片 " +
          out.filter((x) => !x.image).length + " 筆");
      return out;
    },
  };
  try {
    log("頁面", location.href, "標題", document.title, "可見性", document.visibilityState);
    ${task.wait ? `await ctx.waitFor(${JSON.stringify(task.wait)});` : ""}
    const items = await (async function (ctx) {
${task.code}
    })(ctx);
    __send({ ok: true, items: Array.isArray(items) ? items : [] });
  } catch (e) {
    log("錯誤時的網址", location.href);
    __send({ ok: false, error: String((e && e.message) || e) });
  }
})();`;
}
