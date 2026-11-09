// Custom URI schemes are exposed as http://<scheme>.localhost on Windows/Android
// and as <scheme>://localhost elsewhere.
const isWindows = navigator.userAgent.includes("Windows") || navigator.userAgent.includes("Android");
const BASE = isWindows ? "http://imgproxy.localhost/" : "imgproxy://localhost/";

/**
 * Routes a shop image through the Rust image proxy, which fetches it with the
 * shop's own page as Referer (beats hot-link protection) and caches it.
 */
export function proxiedImage(image: string, pageUrl: string): string {
  if (!/^https?:\/\//.test(image)) return image; // data: URIs etc. load directly
  let referer = "";
  try {
    referer = new URL(pageUrl).origin + "/";
  } catch {
    /* no referer */
  }
  return `${BASE}?u=${encodeURIComponent(image)}&r=${encodeURIComponent(referer)}`;
}
