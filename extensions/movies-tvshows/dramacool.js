/**
 * StrawVerse Extension - DramaCool Scraper
 * Specializing in Asian Dramas, Kdramas, Cdramas, Jdramas & Movies
 * Based on https://dramacool9.rest and StrawVerse Extension Specification.
 */

const cheerio = require("cheerio");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

function nodeHttpsStreamAdapter(config) {
  return new Promise((resolve, reject) => {
    function executeRequest(currentUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error("Too many redirects"));
      }
      try {
        const u = new URL(currentUrl);
        const method = (config.method || "GET").toUpperCase();

        const flatHeaders = {};
        if (config.headers) {
          if (typeof config.headers.toJSON === "function") {
            Object.assign(flatHeaders, config.headers.toJSON());
          } else {
            Object.assign(flatHeaders, config.headers);
          }
        }

        let callerReferer = null;
        let callerOrigin = null;
        for (const k of Object.keys(flatHeaders)) {
          const lk = k.toLowerCase();
          if (lk === "referer") callerReferer = flatHeaders[k];
          if (lk === "origin") callerOrigin = flatHeaders[k];
          if (
            lk === "user-agent" ||
            lk === "referer" ||
            lk === "origin" ||
            lk === "host" ||
            lk === "accept-encoding"
          ) {
            delete flatHeaders[k];
          }
        }

        flatHeaders["Host"] = u.hostname;
        flatHeaders["User-Agent"] =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

        const hostLower = u.hostname.toLowerCase();
        const pathLower = u.pathname.toLowerCase();

        // 1. Honor caller-supplied Referer & Origin if passed
        if (callerReferer) {
          flatHeaders["Referer"] = callerReferer;
          flatHeaders["Origin"] =
            callerOrigin || callerReferer.replace(/\/+$/, "");
        } else if (
          hostLower.includes("playdrive") ||
          hostLower.includes("play4u") ||
          hostLower.includes("gothamnet") ||
          hostLower.includes("uprising") ||
          hostLower.includes("furiosamedia") ||
          pathLower.includes("/range/")
        ) {
          const baseHost =
            hostLower.includes("play4u") || hostLower.includes("uprising")
              ? "https://play4u.org/"
              : "https://playdrive.vip/";
          flatHeaders["Referer"] = baseHost;
          flatHeaders["Origin"] = baseHost.replace(/\/+$/, "");
        } else if (
          hostLower.includes("hdstream4u") ||
          hostLower.includes("acek-cdn") ||
          hostLower.includes("dramiyos")
        ) {
          flatHeaders["Referer"] = "https://hdstream4u.com/";
          flatHeaders["Origin"] = "https://hdstream4u.com";
        } else if (
          hostLower.includes("vidrift") ||
          hostLower.includes("hakunaymatata")
        ) {
          flatHeaders["Referer"] = "https://embed.vidrift.in/";
          flatHeaders["Origin"] = "https://embed.vidrift.in";
        } else if (hostLower.includes("vidly") || hostLower.includes("rousav")) {
          flatHeaders["Referer"] = "https://vidly.pro/";
          flatHeaders["Origin"] = "https://vidly.pro";
        } else if (hostLower.includes("vidbolt")) {
          flatHeaders["Referer"] = "https://vidbolt.xyz/";
          flatHeaders["Origin"] = "https://vidbolt.xyz";
        } else if (hostLower.includes("cinezo")) {
          flatHeaders["Referer"] = "https://player.cinezo.live/";
          flatHeaders["Origin"] = "https://player.cinezo.live";
        } else if (hostLower.includes("vidy")) {
          flatHeaders["Referer"] = "https://www.vidy.st/";
          flatHeaders["Origin"] = "https://www.vidy.st";
        } else if (hostLower.includes("lightspeed")) {
          flatHeaders["Referer"] = "https://cinejoy.pk/";
          flatHeaders["Origin"] = "https://cinejoy.pk";
        } else if (hostLower.includes("vidbasic")) {
          flatHeaders["Referer"] = "https://vidbasic.top/";
          flatHeaders["Origin"] = "https://vidbasic.top";
        } else if (
          hostLower.includes("vidmoly") ||
          hostLower.includes("vmnow") ||
          hostLower.includes("vmpx")
        ) {
          flatHeaders["Referer"] = "https://vidmoly.org/";
          flatHeaders["Origin"] = "https://vidmoly.org";
        } else if (hostLower.includes("mixdrop")) {
          flatHeaders["Referer"] = "https://mixdrop.ag/";
        } else if (
          hostLower.includes("streamtape") ||
          hostLower.includes("watchadsontape")
        ) {
          flatHeaders["Referer"] = "https://streamtape.com/";
        } else if (
          hostLower.includes("streamwish") ||
          hostLower.includes("flaswish") ||
          hostLower.includes("strwish")
        ) {
          flatHeaders["Referer"] = "https://streamwish.to/";
        } else if (hostLower.includes("nekomux")) {
          flatHeaders["Referer"] = "https://player.nekomux.com/";
          flatHeaders["Origin"] = "https://player.nekomux.com";
        } else if (hostLower.includes("reanime")) {
          flatHeaders["Referer"] = "https://reanime.to/";
          flatHeaders["Origin"] = "https://reanime.to";
        } else if (hostLower.includes("1hanime")) {
          flatHeaders["Referer"] = "https://1hanime.com/";
          flatHeaders["Origin"] = "https://1hanime.com";
        } else if (hostLower.includes("bingr")) {
          flatHeaders["Referer"] = "https://bingr.one/";
          flatHeaders["Origin"] = "https://bingr.one";
        } else {
          flatHeaders["Referer"] = "https://dramacool9.rest/";
        }

        if (!flatHeaders["Accept"]) {
          flatHeaders["Accept"] = "*/*";
        }

        const reqOptions = {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: method,
          headers: flatHeaders,
        };

        const transport = u.protocol === "https:" ? https : http;
        const req = transport.request(reqOptions, (res) => {
          const statusCode = res.statusCode || 200;
          const resHeaders = res.headers || {};

          // Follow redirects automatically, but abort if redirected away to anti-bot traps
          if (
            (statusCode === 301 ||
              statusCode === 302 ||
              statusCode === 303 ||
              statusCode === 307 ||
              statusCode === 308) &&
            resHeaders.location
          ) {
            res.resume();
            const nextUrl = new URL(resHeaders.location, currentUrl).toString();
            const nextHost = new URL(nextUrl).hostname.toLowerCase();
            if (
              nextHost.includes("google.com") ||
              nextHost.includes("recaptcha")
            ) {
              const err = new Error(
                `Request rejected by upstream redirecting to ${nextHost}`
              );
              err.status = 403;
              err.isAxiosError = true;
              return reject(err);
            }
            return executeRequest(nextUrl, redirectCount + 1);
          }

          function createResponse(data) {
            return {
              status: statusCode,
              statusText: res.statusMessage || "OK",
              headers: resHeaders,
              config,
              request: req,
              data,
            };
          }

          function handleValidateStatus(responseObj) {
            const isValid =
              typeof config.validateStatus === "function"
                ? config.validateStatus(statusCode)
                : statusCode >= 200 && statusCode < 300;
            if (!isValid) {
              const err = new Error(
                `Request failed with status code ${statusCode}`
              );
              err.config = config;
              err.request = req;
              err.response = responseObj;
              err.status = statusCode;
              err.isAxiosError = true;
              return reject(err);
            }
            resolve(responseObj);
          }

          if (config.responseType === "stream" || method === "HEAD") {
            const resp = createResponse(res);
            return handleValidateStatus(resp);
          }

          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            let buf = Buffer.concat(chunks);
            const enc = (resHeaders["content-encoding"] || "").toLowerCase();
            try {
              if (enc === "gzip") {
                buf = zlib.gunzipSync(buf);
              } else if (enc === "deflate") {
                buf = zlib.inflateSync(buf);
              } else if (enc === "br") {
                buf = zlib.brotliDecompressSync(buf);
              }
            } catch (_) {}

            if (
              config.responseType === "arraybuffer" ||
              config.responseType === "buffer"
            ) {
              return handleValidateStatus(createResponse(buf));
            }

            const text = buf.toString("utf8");
            let data = text;
            try {
              data = JSON.parse(text);
            } catch (_) {}

            handleValidateStatus(createResponse(data));
          });
        });

        if (config.timeout && config.timeout > 0) {
          req.setTimeout(config.timeout, () => {
            req.destroy(new Error(`timeout of ${config.timeout}ms exceeded`));
          });
        }

        req.on("error", (err) => {
          reject(err);
        });

        if (config.data) {
          const body =
            typeof config.data === "string"
              ? config.data
              : JSON.stringify(config.data);
          req.write(body);
        }

        req.end();
      } catch (e) {
        reject(e);
      }
    }

    executeRequest(config.url);
  });
}

function installStreamProxyInterceptor() {
  if (!global.axios || !global.axios.interceptors?.request) return;

  if (global.__strawverseStreamInterceptorId !== undefined) {
    try {
      global.axios.interceptors.request.eject(global.__strawverseStreamInterceptorId);
    } catch (_) {}
  }

  global.__strawverseStreamInterceptorId = global.axios.interceptors.request.use(
    (config) => {
      try {
        const urlStr = String(config.url || "").toLowerCase();
        const isMediaStream =
          config.responseType === "stream" ||
          urlStr.includes(".m3u8") ||
          urlStr.includes(".ts") ||
          urlStr.includes(".m4s") ||
          urlStr.includes(".mp4") ||
          urlStr.includes("#video.mp4") ||
          urlStr.includes("gothamnet") ||
          urlStr.includes("uprising") ||
          urlStr.includes("furiosamedia") ||
          urlStr.includes("/range/") ||
          urlStr.includes("playdrive") ||
          urlStr.includes("play4u") ||
          urlStr.includes("hdstream") ||
          urlStr.includes("streamwish") ||
          urlStr.includes("streamtape") ||
          urlStr.includes("watchadsontape") ||
          urlStr.includes("mixdrop") ||
          urlStr.includes("filelions") ||
          urlStr.includes("vidbasic") ||
          urlStr.includes("vidmoly") ||
          urlStr.includes("vmnow") ||
          urlStr.includes("vmpx") ||
          urlStr.includes("exoidol") ||
          urlStr.includes("sssrr.org") ||
          urlStr.includes("abyss") ||
          urlStr.includes("nekomux") ||
          urlStr.includes("flixcloud") ||
          urlStr.includes("rundowncdn") ||
          urlStr.includes("fetch9") ||
          urlStr.includes("r2.1hanime.com") ||
          urlStr.includes("htstreaming.com") ||
          urlStr.includes("nhplayer.com") ||
          urlStr.includes("vidrift") ||
          urlStr.includes("hakunaymatata") ||
          urlStr.includes("rousav") ||
          urlStr.includes("vidbolt") ||
          urlStr.includes("cinezo") ||
          urlStr.includes("vidy") ||
          urlStr.includes("lightspeed") ||
          urlStr.includes("vidly");

        const isTarget =
          isMediaStream ||
          urlStr.includes("dramacool9.rest") ||
          urlStr.includes("vidbasic.top") ||
          urlStr.includes("vidmoly.org");

        if (isTarget) {
          config.strawverseDirectHttp = true;
          config._forceNativeBridge = false;

          if (isMediaStream) {
            config.adapter = nodeHttpsStreamAdapter;
          }
        }
      } catch (_) {}
      return config;
    },
    (err) => Promise.reject(err)
  );
}

try {
  installStreamProxyInterceptor();
} catch (_) {}

const baseUrl = "https://dramacool9.rest";

// Decryption keys discovered from DramaCool / Vidbasic player embed
const VIDBASIC_KEY = "94588293375053432799222445521289";
const VIDBASIC_IV = "5259228356829423";

// Declarative header rules for DramaCool, Vidbasic player, image CDNs and stream CDNs
const headerRules = [
  {
    match: [
      "dramacool9.rest",
      "vidbasic.top",
      "stream.vidbasic.top",
      "hls.vidbasic.top",
      "exoidol.space",
      "asianctv",
      "streamwish",
      "hglink.to",
      "myasiantv",
      "drama123",
      "dramizo",
      "kissasian",
      "vikiplatform",
    ],
    headers: {
      Referer: "https://dramacool9.rest/",
      Origin: "https://dramacool9.rest",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
  {
    match: [
      "vidbasic.top",
      "stream.vidbasic.top",
      "hls.vidbasic.top",
      "exoidol.space",
    ],
    headers: {
      Referer: "https://vidbasic.top/",
      Origin: "https://vidbasic.top",
    },
  },
  {
    match: [
      "vmnow.online",
      "vmpx.online",
      "vidmoly.org",
      "vidmoly.net",
      "vidmoly.biz",
      "vidmoly.to",
    ],
    headers: {
      Referer: "https://vidmoly.org/",
      Origin: "https://vidmoly.org",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
  {
    match: [
      "streamtape.com",
      "tapecontent.net",
      "watchadsontape.com",
    ],
    headers: {
      Referer: "https://streamtape.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: [
      "vidbasic.top",
      "stream.vidbasic.top",
      "hls.vidbasic.top",
      "exoidol.space",
      "vmnow.online",
      "vmpx.online",
    ],
    headers: {
      Referer: "https://vidbasic.top/",
      Origin: "https://vidbasic.top",
    },
  },
];

const bypassDomains = [
  "dramacool9.rest",
  "dramacool9.com",
  "vidbasic.top",
  "stream.vidbasic.top",
  "hls.vidbasic.top",
  "exoidol.space",
  "vidmoly.biz",
  "vidmoly.net",
  "streamtape.com",
  "mixdrop.top",
  "mixdrop.ps",
  "myasiantv.rest",
  "drama123.tv",
  "dramizo.com",
];

const _global =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof global !== "undefined"
    ? global
    : {};

// Resilient HTTP request helper (uses _global.axios if available, falls back to native fetch)
async function httpGet(url, options = {}) {
  if (_global.axios) {
    try {
      const axiosRes = await _global.axios.get(url, options);
      return {
        data: axiosRes.data,
        status: axiosRes.status,
        headers: axiosRes.headers,
      };
    } catch (_) {
      // Fall through to native fetch on failure
    }
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...(options.headers || {}),
  };
  const timeoutMs = options.timeout || 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text;
    }
    return { data, status: res.status, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Clean and extract drama slug from an ID or URL.
 */
function cleanSlug(str) {
  if (!str || typeof str !== "string") return "";
  let clean = str.trim();
  clean = clean.replace(/^https?:\/\/[^\/]+/i, "");
  clean = clean.replace(/^\/drama\//i, "");
  clean = clean.replace(/^\/+|\/+$/g, "");
  return clean;
}

/**
 * Generate a clean URL slug from title text.
 */
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePage(arg) {
  if (typeof arg === "number" && Number.isFinite(arg)) {
    return Math.max(1, Math.floor(arg));
  }
  if (typeof arg === "string") {
    const p = parseInt(arg.trim(), 10);
    return isNaN(p) || p < 1 ? 1 : p;
  }
  if (arg && typeof arg === "object") {
    if (arg.page !== undefined) return normalizePage(arg.page);
    if (arg.filters && typeof arg.filters === "object") return normalizePage(arg.filters);
  }
  return 1;
}

/**
 * Filter out hotlink-blocked image CDNs (e.g. asiaflix.net returns 403 on direct requests)
 * and prioritize TMDB or unblocked mirrors.
 */
function pickBestImage(image, coverImage) {
  const isBad = (u) => !u || typeof u !== "string" || u.includes("asiaflix.net");
  if (coverImage && coverImage.includes("tmdb.org")) return coverImage;
  if (image && !isBad(image)) return image;
  if (coverImage && !isBad(coverImage)) return coverImage;
  return image || coverImage || null;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with",
  "by", "from", "is", "it", "as", "be", "this", "that"
]);

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 999;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Strictly check if candidate title matches what was queried by the user.
 * Prevents fuzzy stop-word leaks (e.g. matching "the" or "you" to unrelated titles).
 */
function isRelevantMatch(itemTitle, query) {
  const t = (itemTitle || "").toLowerCase().trim();
  const q = (query || "").toLowerCase().trim();
  if (!t || !q) return false;

  if (t === q || t.includes(q)) return true;

  const cleanT = t.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const cleanQ = q.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  if (cleanT.includes(cleanQ)) return true;

  const allQWords = cleanQ.split(" ").filter((w) => w.length > 0);
  const significantQWords = allQWords.filter((w) => !STOP_WORDS.has(w));
  const wordsToMatch =
    significantQWords.length > 0 ? significantQWords : allQWords;

  const tWords = cleanT.split(" ").filter((w) => w.length > 0);

  let matchCount = 0;
  for (const w of wordsToMatch) {
    const found = tWords.some((tw) => {
      if (tw === w) return true;
      if (
        w.length >= 4 &&
        tw.length >= 4 &&
        (tw.startsWith(w) || w.startsWith(tw))
      )
        return true;
      if (w.length >= 5 && tw.length >= 5 && editDistance(tw, w) <= 1)
        return true;
      return false;
    });
    if (found) matchCount++;
  }

  if (wordsToMatch.length <= 2) {
    return matchCount === wordsToMatch.length;
  } else {
    return matchCount >= Math.ceil(wordsToMatch.length * 0.75);
  }
}

/**
 * Calculate relevance score between candidate title and user search query.
 */
function calculateRelevance(itemTitle, query) {
  const t = (itemTitle || "").toLowerCase().trim();
  const q = (query || "").toLowerCase().trim();
  if (!t || !q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 600;
  if (t.includes(q)) return 400;

  const qWords = q.split(/\s+/).filter((w) => w.length > 1);
  const tWords = t.split(/\s+/).filter((w) => w.length > 1);
  if (qWords.length === 0 || tWords.length === 0) return 0;

  let matches = 0;
  for (const w of qWords) {
    if (tWords.includes(w) || t.includes(w)) matches++;
  }
  return (matches / qWords.length) * 350;
}

/**
 * Parse Angular SSR pre-rendered state from HTML.
 * @param {string} html
 * @returns {Record<string, any>|null}
 */
function parseNgState(html) {
  if (!html || typeof html !== "string") return null;
  const match = html.match(
    /<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return null;
  }
}

/**
 * Decrypt AES-256-CBC token to UTF-8 plaintext.
 */
function decryptAes(ciphertext, keyStr = VIDBASIC_KEY, ivStr = VIDBASIC_IV) {
  try {
    const key = Buffer.from(keyStr, "utf8");
    const iv = Buffer.from(ivStr, "utf8");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve Vidbasic player embed to direct HLS m3u8 playlist and subtitles.
 * @param {string} embedUrl
 * @returns {Promise<{ hlsUrl: string|null, subUrl: string|null }>}
 */
async function resolveVidbasicStream(embedUrl) {
  try {
    const res = await httpGet(embedUrl, {
      headers: {
        Referer: `${baseUrl}/`,
      },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return { hlsUrl: null, subUrl: null };

    const vMatch = html.match(/data-video="([^"]+)"/);
    if (!vMatch) return { hlsUrl: null, subUrl: null };

    const playerPath = vMatch[1];
    const playerUrl = playerPath.startsWith("http")
      ? playerPath
      : `https://vidbasic.top${playerPath}`;

    const playerRes = await httpGet(playerUrl, {
      headers: {
        Referer: embedUrl,
      },
    });
    const playerHtml =
      typeof playerRes.data === "string" ? playerRes.data : "";
    if (!playerHtml) return { hlsUrl: null, subUrl: null };

    const cMatch = playerHtml.match(
      /data-name="crypto"\s+data-value="([^"]+)"/,
    );
    if (!cMatch) return { hlsUrl: null, subUrl: null };

    const cryptoData = cMatch[1];
    const hlsUrl = decryptAes(cryptoData);

    let subUrl = null;
    const sMatch = playerPath.match(/[?&]sub=([^&]+)/);
    if (sMatch) {
      try {
        subUrl = decryptAes(decodeURIComponent(sMatch[1]));
      } catch (_) {}
    }

    return { hlsUrl, subUrl };
  } catch (err) {
    return { hlsUrl: null, subUrl: null };
  }
}

/**
 * Resolve Vidmoly player embed to direct HLS m3u8 playlist.
 * @param {string} embedUrl
 * @returns {Promise<{ url: string, headers: object }|null>}
 */
async function resolveVidmolyStream(embedUrl) {
  try {
    const res = await httpGet(embedUrl, {
      headers: {
        Referer: `${baseUrl}/`,
      },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const m3u8Match = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/);
    if (m3u8Match) {
      let host = "https://vidmoly.org/";
      try {
        host = new URL(embedUrl).origin + "/";
      } catch (_) {}
      return {
        url: m3u8Match[0],
        headers: {
          Referer: host,
          Origin: host.replace(/\/+$/, ""),
        },
      };
    }
  } catch (err) {}
  return null;
}

/**
 * Resolve Streamtape player embed to direct MP4 video link.
 * @param {string} embedUrl
 * @returns {Promise<{ url: string, headers: object }|null>}
 */
async function resolveStreamtapeStream(embedUrl) {
  try {
    const res = await httpGet(embedUrl, {
      headers: {
        Referer: `${baseUrl}/`,
      },
    });
    const html = typeof res.data === "string" ? res.data : "";

    // Pattern 1: robotlink with two substrings
    const robotMatch = html.match(
      /getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)\.substring\((\d+)\)/,
    );
    if (robotMatch) {
      const prefix = robotMatch[1];
      const str = robotMatch[2];
      const sub1 = parseInt(robotMatch[3], 10);
      const sub2 = parseInt(robotMatch[4], 10);
      let fullUrl =
        (prefix.startsWith("http") ? "" : "https:") +
        prefix +
        str.substring(sub1).substring(sub2);
      if (!fullUrl.match(/\.(mp4|mkv|webm|mov|avi)$/i) && !fullUrl.includes("#")) {
        fullUrl += "#video.mp4";
      }
      return {
        url: fullUrl,
        headers: {
          Referer: "https://streamtape.com/",
        },
      };
    }

    // Pattern 2: botlink / ideoolink with single substring
    const botMatch = html.match(
      /getElementById\(['"](?:botlink|ideoolink)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/,
    );
    if (botMatch) {
      const prefix = botMatch[1];
      const str = botMatch[2];
      const sub1 = parseInt(botMatch[3], 10);
      let fullUrl =
        (prefix.startsWith("http") ? "" : "https:") +
        prefix +
        str.substring(sub1);
      if (!fullUrl.match(/\.(mp4|mkv|webm|mov|avi)$/i) && !fullUrl.includes("#")) {
        fullUrl += "#video.mp4";
      }
      return {
        url: fullUrl,
        headers: {
          Referer: "https://streamtape.com/",
        },
      };
    }
  } catch (err) {}
  return null;
}

/**
 * Search dramas by query string with pagination, relevance scoring, and exact match resolution.
 * @param {string} query
 * @param {number|object} page
 * @returns {Promise<{ results: Array<any>, hasNextPage: boolean, currentPage: number, totalPages?: number }>}
 */
async function SearchAnime(query, page = 1) {
  const pageNum = normalizePage(page);
  const searchQuery = (query || "").trim();
  if (!searchQuery) {
    if (typeof fetchRecentEpisodes === "function") {
      return fetchRecentEpisodes(pageNum);
    }
    return {
      results: [],
      hasNextPage: false,
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: 0,
    };
  }

  const results = [];
  const seenSlugs = new Set();
  let hasNext = false;
  let totalPages = 1;

  try {
    // 1. On page 1, check direct candidate slug matches (with and without "the-")
    if (pageNum === 1) {
      const baseSlug = slugify(searchQuery);
      const candidateSlugs = new Set();
      if (baseSlug) {
        candidateSlugs.add(baseSlug);
        if (!baseSlug.startsWith("the-")) {
          candidateSlugs.add(`the-${baseSlug}`);
        } else {
          candidateSlugs.add(baseSlug.replace(/^the-/, ""));
        }
      }

      for (const candidateSlug of candidateSlugs) {
        if (!candidateSlug || candidateSlug.length < 3) continue;
        if (seenSlugs.has(candidateSlug)) continue;
        try {
          const directUrl = `${baseUrl}/drama/${candidateSlug}`;
          const directRes = await httpGet(directUrl, {
            headers: { Referer: `${baseUrl}/` },
          });
          const directHtml =
            typeof directRes.data === "string" ? directRes.data : "";
          if (directHtml) {
            const directState = parseNgState(directHtml);
            if (directState) {
              for (const k of Object.keys(directState)) {
                const item = directState[k];
                if (item?.u?.includes("detail") && item?.b?.name) {
                  const b = item.b;
                  const itemSlug = b.slug || candidateSlug;
                  if (seenSlugs.has(itemSlug)) break;
                  const bestImg = pickBestImage(b.image, b.coverImage);
                  results.push({
                    id: itemSlug,
                    title: b.name,
                    image: bestImg,
                    type: "Drama",
                    subDub: "Sub",
                    releaseYear: b.releaseYear ? String(b.releaseYear) : "",
                    status: b.status || "Unknown",
                  });
                  seenSlugs.add(itemSlug);
                  break;
                }
              }
            }
          }
        } catch (_) {}
      }
    }

    // 2. Primary API search on dramacool9.rest
    // If query starts with stop words (e.g. "the remarried empress"), DramaCool search engine
    // matches "the" across thousands of irrelevant shows. We search the full query and stripped query.
    const queriesToSearch = [searchQuery];
    const strippedQuery = searchQuery.replace(/^(the|a|an)\s+/i, "").trim();
    if (strippedQuery && strippedQuery.toLowerCase() !== searchQuery.toLowerCase()) {
      queriesToSearch.push(strippedQuery);
    }

    for (const q of queriesToSearch) {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(q)}&page=${pageNum}`;
      const res = await httpGet(searchUrl, {
        headers: { Referer: `${baseUrl}/` },
      });
      const html = typeof res.data === "string" ? res.data : "";

      if (html) {
        const state = parseNgState(html);
        if (state) {
          for (const k of Object.keys(state)) {
            const item = state[k];
            if (item?.u?.includes("search") && item?.b?.body) {
              const bodyList = Array.isArray(item.b.body) ? item.b.body : [];
              hasNext = !!item.b.hasNext;
              totalPages = item.b.totalPages || 1;

              for (const d of bodyList) {
                const slug = d.slug;
                if (!slug || seenSlugs.has(slug)) continue;
                seenSlugs.add(slug);

                const bestImg = pickBestImage(d.image, d.coverImage);
                results.push({
                  id: slug,
                  title: d.name || d.normalizedName || slug,
                  image: bestImg,
                  type: "Drama",
                  subDub: "Sub",
                  releaseYear: d.releaseYear ? String(d.releaseYear) : "",
                  status: d.status || "Unknown",
                });
              }
              break;
            }
          }
        }

        // Cheerio DOM Fallback
        if (results.length === 0) {
          const $ = cheerio.load(html);
          $("a[href*='/drama/']").each((_, el) => {
            const href = $(el).attr("href") || "";
            const slug = cleanSlug(href);
            if (!slug || seenSlugs.has(slug)) return;
            seenSlugs.add(slug);

            const title =
              $(el).find(".title, h3, h2").text().trim() ||
              $(el).attr("title") ||
              slug;
            const imgTag = $(el).find("img");
            const image =
              imgTag.attr("src") ||
              imgTag.attr("data-src") ||
              imgTag.attr("data-lazy-src") ||
              null;

            results.push({
              id: slug,
              title,
              image,
              type: "Drama",
              subDub: "Sub",
            });
          });
        }
      }
    }

    // 3. Strict Relevance Filtering: Only display results that match what was queried
    const filteredResults = results.filter((r) =>
      isRelevantMatch(r.title, searchQuery),
    );

    // 4. Relevance ranking: Rank exact matches and query overlaps at the very top
    filteredResults.sort((a, b) => {
      const scoreA = calculateRelevance(a.title, searchQuery);
      const scoreB = calculateRelevance(b.title, searchQuery);
      return scoreB - scoreA;
    });

    return {
      results: filteredResults,
      hasNextPage: (hasNext || pageNum < totalPages) && filteredResults.length > 0,
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: filteredResults.length === 0 ? 0 : totalPages,
    };
  } catch (err) {
    return {
      results: [],
      hasNextPage: false,
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: 0,
    };
  }
}

/**
 * Fetch detailed drama metadata and complete episode list.
 * @param {string} id - Drama slug or URL
 */
async function AnimeInfo(id) {
  const slug = cleanSlug(id);
  const dramaInfo = {
    id: slug,
    title: "",
    image: null,
    image_url: null,
    description: "",
    genres: [],
    status: "Unknown",
    type: "Drama",
    aired: "",
    country: "",
    totalEpisodes: 0,
    episodes: [],
  };

  try {
    const dramaUrl = `${baseUrl}/drama/${slug}`;
    const res = await httpGet(dramaUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return dramaInfo;

    const state = parseNgState(html);

    if (state) {
      for (const k of Object.keys(state)) {
        const entry = state[k];
        if (entry?.u?.includes("detail") && entry?.b) {
          const b = entry.b;
          dramaInfo.title = String(b.name || b.originalName || slug);
          
          const bestImg = pickBestImage(b.image, b.coverImage);
          dramaInfo.image = bestImg;
          dramaInfo.image_url = bestImg;
          dramaInfo.description = String(b.description || b.synopsis || "");

          // CRITICAL FIX: b.genres is [{ name, url }], extract clean strings so React doesn't crash
          dramaInfo.genres = Array.isArray(b.genres)
            ? b.genres
                .map((g) => (typeof g === "string" ? g : g?.name || ""))
                .filter(Boolean)
            : [];

          let dramaStatus = String(b.status || "").trim();
          if (!dramaStatus && Array.isArray(b.episodes) && b.episodes.length === 0) {
            dramaStatus = "Upcoming";
          }
          dramaInfo.status = dramaStatus || "Unknown";
          dramaInfo.aired = b.releaseYear ? String(b.releaseYear) : "";
          dramaInfo.country = String(b.country || "");

          if (Array.isArray(b.episodes)) {
            dramaInfo.totalEpisodes = b.episodes.length;
            dramaInfo.episodes = b.episodes.map((ep) => {
              const epNum = ep.number || 1;
              return {
                id: `${slug}/episode-${epNum}`,
                number: epNum,
                title: ep.title ? String(ep.title) : `Episode ${epNum}`,
                thumbnail: dramaInfo.image,
              };
            });
          }
          break;
        }
      }
    }

    // HTML DOM Fallback (only if ng-state was completely absent)
    if (!state && (!dramaInfo.title || dramaInfo.episodes.length === 0)) {
      const $ = cheerio.load(html);
      if (!dramaInfo.title) {
        dramaInfo.title =
          $("h1").first().text().trim() || slug;
      }
      if (!dramaInfo.image) {
        const img = $("img[src*='poster'], img[src*='upload']").first();
        dramaInfo.image = img.attr("src") || null;
        dramaInfo.image_url = dramaInfo.image;
      }
      if (dramaInfo.episodes.length === 0) {
        $("a").each((idx, el) => {
          const href = $(el).attr("href") || "";
          if (href.includes("/episode-") && href.includes(slug)) {
            const match = href.match(/episode-(\d+)/);
            const epNum = match ? parseInt(match[1], 10) : idx + 1;
            const epId = `${slug}/episode-${epNum}`;
            if (!dramaInfo.episodes.some((e) => e.id === epId)) {
              dramaInfo.episodes.push({
                id: epId,
                number: epNum,
                title: $(el).text().trim() || `Episode ${epNum}`,
                thumbnail: dramaInfo.image,
              });
            }
          }
        });
        dramaInfo.totalEpisodes = dramaInfo.episodes.length;
      }
    }

    return dramaInfo;
  } catch (err) {
    return dramaInfo;
  }
}

/**
 * Fetch episode list for pagination support.
 */
async function fetchEpisode(id, page = 1) {
  try {
    const info = await AnimeInfo(id);
    return {
      episodes: info.episodes || [],
      totalPages: 1,
      total: (info.episodes || []).length,
      currentPage: 1,
    };
  } catch (err) {
    return { episodes: [], totalPages: 0, total: 0, currentPage: page };
  }
}

/**
 * Fetch playable stream sources and subtitles for an episode.
 * @param {string} episodeId - e.g. "nice-to-not-meet-you/episode-1"
 * @param {string|null} category
 * @returns {Promise<{ sources: Array<any>, subtitles: Array<any> }>}
 */
async function fetchEpisodeSources(episodeId, category = null) {
  installStreamProxyInterceptor();
  const sources = [];
  const subtitles = [];

  try {
    let cleanId = (episodeId || "").trim();
    cleanId = cleanId.replace(/^https?:\/\/[^\/]+/i, "");
    cleanId = cleanId.replace(/^\/drama\//i, "");
    cleanId = cleanId.replace(/^\/+|\/+$/g, "");

    const episodeUrl = `${baseUrl}/drama/${cleanId}`;

    // Register stream headers for StrawVerse stream proxy & player
    if (typeof _global.registerStreamHeaders === "function") {
      _global.registerStreamHeaders("vidbasic.top", {
        Referer: "https://vidbasic.top/",
        Origin: "https://vidbasic.top",
      });
      _global.registerStreamHeaders("stream.vidbasic.top", {
        Referer: "https://vidbasic.top/",
        Origin: "https://vidbasic.top",
      });
      _global.registerStreamHeaders("hls.vidbasic.top", {
        Referer: "https://vidbasic.top/",
        Origin: "https://vidbasic.top",
      });
      _global.registerStreamHeaders("exoidol.space", {
        Referer: "https://vidbasic.top/",
        Origin: "https://vidbasic.top",
      });
      _global.registerStreamHeaders("dramacool9.rest", {
        Referer: "https://dramacool9.rest/",
      });
      _global.registerStreamHeaders("vidmoly.org", {
        Referer: "https://vidmoly.org/",
        Origin: "https://vidmoly.org",
      });
      _global.registerStreamHeaders("vmnow.online", {
        Referer: "https://vidmoly.org/",
        Origin: "https://vidmoly.org",
      });
      _global.registerStreamHeaders("vmpx.online", {
        Referer: "https://vidmoly.org/",
        Origin: "https://vidmoly.org",
      });
      _global.registerStreamHeaders("streamtape.com", {
        Referer: "https://streamtape.com/",
      });
    }

    if (typeof _global.registerSubrequestHeaders === "function") {
      _global.registerSubrequestHeaders("exoidol.space", {
        Referer: "https://vidbasic.top/",
        Origin: "https://vidbasic.top",
      });
      _global.registerSubrequestHeaders("stream.vidbasic.top", {
        Referer: "https://vidbasic.top/",
        Origin: "https://vidbasic.top",
      });
      _global.registerSubrequestHeaders("hls.vidbasic.top", {
        Referer: "https://vidbasic.top/",
        Origin: "https://vidbasic.top",
      });
      _global.registerSubrequestHeaders("vmnow.online", {
        Referer: "https://vidmoly.org/",
        Origin: "https://vidmoly.org",
      });
      _global.registerSubrequestHeaders("vmpx.online", {
        Referer: "https://vidmoly.org/",
        Origin: "https://vidmoly.org",
      });
    }

    const res = await httpGet(episodeUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return { sources, subtitles };

    const state = parseNgState(html);
    let streamUrls = [];

    // Extract episode number from ID (e.g. "nice-to-not-meet-you/episode-1" -> 1)
    const epNumMatch = cleanId.match(/episode-(\d+)/i);
    const targetEpNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;

    if (state) {
      for (const k of Object.keys(state)) {
        const entry = state[k];
        if (entry?.u?.includes("detail") && entry?.b?.episodes) {
          const matchedEp = entry.b.episodes.find(
            (e) => e.number === targetEpNum,
          );
          if (matchedEp && Array.isArray(matchedEp.streamUrls)) {
            streamUrls = matchedEp.streamUrls;
            break;
          }
        }
      }
    }

    // 1. Process Vidbasic stream (Primary direct master HLS)
    const vidbasicEntry = streamUrls.find(
      (s) =>
        s.source === "vidbasic" ||
        (s.url && s.url.includes("vidbasic.top")),
    );
    if (vidbasicEntry && vidbasicEntry.url) {
      const resolved = await resolveVidbasicStream(vidbasicEntry.url);
      if (resolved?.hlsUrl) {
        sources.push({
          name: "DramaCool Vidbasic (Fast HLS)",
          quality: "1080p (HLS)",
          url: resolved.hlsUrl,
          isM3U8: true,
          headers: {
            Referer: "https://vidbasic.top/",
            Origin: "https://vidbasic.top",
          },
        });
      }
      if (resolved?.subUrl) {
        subtitles.push({
          url: resolved.subUrl,
          lang: "English",
        });
      }
    }

    // 2. Resolve direct Vidmoly and Streamtape video streams
    for (const s of streamUrls) {
      if (!s.url) continue;
      const url = s.url.trim();

      if (url.includes("vidmoly")) {
        const resolved = await resolveVidmolyStream(url);
        if (resolved?.url && !sources.some((x) => x.url === resolved.url)) {
          sources.push({
            name: "DramaCool Vidmoly (HLS)",
            quality: "1080p / 720p (HLS)",
            url: resolved.url,
            isM3U8: true,
            headers: resolved.headers,
          });
        }
      } else if (url.includes("streamtape") || url.includes("watchadsontape")) {
        const resolved = await resolveStreamtapeStream(url);
        if (resolved?.url && !sources.some((x) => x.url === resolved.url)) {
          sources.push({
            name: "DramaCool Streamtape (MP4)",
            quality: "720p (MP4)",
            url: resolved.url,
            isM3U8: false,
            headers: resolved.headers,
          });
        }
      }
    }

    return { sources, subtitles };
  } catch (err) {
    return { sources, subtitles };
  }
}

/**
 * Fetch recently updated episodes / dramas from DramaCool.
 * Page 1 reads "Latest Updates" from homepage. Page 2+ paginates through /explore.
 * @param {number|object} page
 */
async function fetchRecentEpisodes(page = 1) {
  const pageNum = normalizePage(page);

  try {
    const targetUrl =
      pageNum === 1
        ? `${baseUrl}/`
        : `${baseUrl}/explore?page=${pageNum}`;

    const res = await httpGet(targetUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) {
      return {
        results: [],
        hasNextPage: false,
        currentPage: pageNum,
        current_page: pageNum,
        page: pageNum,
        totalPages: 0,
      };
    }

    const state = parseNgState(html);
    const results = [];
    let hasNext = true;
    let totalPages = 100;

    if (state) {
      if (pageNum === 1) {
        for (const k of Object.keys(state)) {
          const entry = state[k];
          const b = entry?.b;
          if (Array.isArray(b)) {
            const recentsSection = b.find(
              (section) =>
                section?.type === "recents" ||
                section?.title === "Latest Updates",
            );
            if (recentsSection && Array.isArray(recentsSection.data)) {
              for (const d of recentsSection.data) {
                if (!d.slug && !d.name) continue;
                const bestImg = pickBestImage(d.image, d.coverImage);
                results.push({
                  id: d.slug,
                  title: d.name || d.normalizedName || d.slug,
                  image: bestImg,
                  type: "Drama",
                  subDub: "Sub",
                  releaseYear: d.releaseYear ? String(d.releaseYear) : "",
                  status: d.status || "Unknown",
                  episode: d.recentEp ? `Ep ${d.recentEp}` : null,
                });
              }
              break;
            }
          }
        }
      } else {
        for (const k of Object.keys(state)) {
          const entry = state[k];
          if (entry?.b?.body && Array.isArray(entry.b.body)) {
            hasNext = !!entry.b.hasNext;
            totalPages = entry.b.totalPages || 100;
            for (const d of entry.b.body) {
              if (!d.slug && !d.name) continue;
              const bestImg = pickBestImage(d.image, d.coverImage);
              results.push({
                id: d.slug,
                title: d.name || d.normalizedName || d.slug,
                image: bestImg,
                type: "Drama",
                subDub: "Sub",
                releaseYear: d.releaseYear ? String(d.releaseYear) : "",
                status: d.status || "Unknown",
              });
            }
            break;
          }
        }
      }
    }

    return {
      results,
      hasNextPage: hasNext,
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages,
    };
  } catch (err) {
    return {
      results: [],
      hasNextPage: false,
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: 0,
    };
  }
}

module.exports = {
  name: "dramacool",
  version: "1.0.9",
  baseUrl,
  headerRules,
  subrequestHeaders,
  bypassDomains,
  SearchAnime,
  SearchMovie: SearchAnime,
  SearchMovies: SearchAnime,
  searchMovies: SearchAnime,
  AnimeInfo,
  MovieInfo: AnimeInfo,
  fetchMovieInfo: AnimeInfo,
  fetchEpisode,
  fetchEpisodeSources,
  fetchMovieSources: fetchEpisodeSources,
  fetchRecentEpisodes,
  latestMovies: fetchRecentEpisodes,
  fetchTrending: fetchRecentEpisodes,
};
