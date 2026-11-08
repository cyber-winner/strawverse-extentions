/**
 * StrawVerse Extension - Hentai.tv Scraper & Stream Resolver
 * Features:
 *  - Native Next.js App Router streaming RSC hydration parser for catalog & metadata
 *  - Direct HTTPS challenge solver (immune to Android WebView bridge cookie & referer stripping)
 *  - Client-side Proof-of-Work engine for NHPlayer challenge resolution
 *  - Direct 1080p MP4 stream resolution with byte-range seeking
 *  - Automated English subtitle (.srt) extraction
 *  - Cloudflare R2 CDN bypass with TLS 1.3 agent & declarative header rules
 */

const crypto = require("crypto");
const https = require("https");
const http = require("http");
const tls = require("tls");

const browserCiphers = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA",
  "AES256-SHA",
].join(":");

let customTlsAgent = null;
try {
  customTlsAgent = new https.Agent({
    ciphers: browserCiphers,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    honorCipherOrder: true,
    keepAlive: true,
  });
} catch (_) {}

function nodeHttpsStreamAdapter(config) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(config.url);
      const method = (config.method || "GET").toUpperCase();

      const flatHeaders = {};
      if (config.headers) {
        if (typeof config.headers.toJSON === "function") {
          Object.assign(flatHeaders, config.headers.toJSON());
        } else {
          Object.assign(flatHeaders, config.headers);
        }
      }

      flatHeaders["Host"] = u.hostname;
      if (!flatHeaders["User-Agent"] && !flatHeaders["user-agent"]) {
        flatHeaders["User-Agent"] =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
      }
      if (!flatHeaders["Referer"] && !flatHeaders["referer"]) {
        flatHeaders["Referer"] = "https://nhplayer.com/";
      }
      if (!flatHeaders["Origin"] && !flatHeaders["origin"]) {
        flatHeaders["Origin"] = "https://nhplayer.com";
      }
      if (!flatHeaders["Accept"] && !flatHeaders["accept"]) {
        flatHeaders["Accept"] = "*/*";
      }
      delete flatHeaders["Accept-Encoding"];
      delete flatHeaders["accept-encoding"];

      const reqOptions = {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: method,
        headers: flatHeaders,
      };

      if (customTlsAgent && u.protocol === "https:") {
        reqOptions.agent = customTlsAgent;
      }

      const transport = u.protocol === "https:" ? https : http;
      const req = transport.request(reqOptions, (res) => {
        const statusCode = res.statusCode || 200;
        const resHeaders = res.headers || {};

        if (config.responseType === "stream" || method === "HEAD") {
          resolve({
            status: statusCode,
            statusText: res.statusMessage || "OK",
            headers: resHeaders,
            config,
            request: req,
            data: res,
          });
        } else if (config.responseType === "arraybuffer" || config.responseType === "buffer") {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            resolve({
              status: statusCode,
              statusText: res.statusMessage || "OK",
              headers: resHeaders,
              config,
              request: req,
              data: Buffer.concat(chunks),
            });
          });
        } else {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () => {
            let data = text;
            try {
              data = JSON.parse(text);
            } catch (_) {}
            resolve({
              status: statusCode,
              statusText: res.statusMessage || "OK",
              headers: resHeaders,
              config,
              request: req,
              data,
            });
          });
        }
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
  });
}

function installStreamProxyInterceptor() {
  if (!global.axios || global.__nhStreamProxyInterceptorInstalled) return;
  global.__nhStreamProxyInterceptorInstalled = true;

  global.axios.interceptors.request.use(
    (config) => {
      try {
        const urlStr = String(config.url || "").toLowerCase();
        const isMediaStream =
          urlStr.includes("r2.1hanime.com") ||
          urlStr.includes("cdn.htstreaming.com");
        const isTarget =
          isMediaStream ||
          urlStr.includes("nhplayer.com") ||
          urlStr.includes("1hanime.com") ||
          urlStr.includes("animeidhentai.com") ||
          urlStr.includes("hentai.tv") ||
          urlStr.includes("hanime.red") ||
          urlStr.includes("hanime.tv");

        if (isTarget) {
          config.strawverseDirectHttp = true;

          if (customTlsAgent) {
            config.httpsAgent = customTlsAgent;
          }

          if (isMediaStream && process.platform !== "android") {
            config.adapter = nodeHttpsStreamAdapter;
          }

          if (isMediaStream) {
            try {
              const u = new URL(config.url);
              if (config.headers?.set) {
                config.headers.set("Host", u.hostname);
                config.headers.set(
                  "User-Agent",
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                );
                config.headers.set("Referer", "https://nhplayer.com/");
                config.headers.set("Origin", "https://nhplayer.com");
              } else {
                config.headers = config.headers || {};
                config.headers["Host"] = u.hostname;
                config.headers["User-Agent"] =
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
                config.headers["Referer"] = "https://nhplayer.com/";
                config.headers["Origin"] = "https://nhplayer.com";
              }
            } catch (_) {}
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

const baseUrl = "https://hentai.tv";

// Declarative header rules for StrawVerse network stack
const headerRules = [
  {
    match: ["r2.1hanime.com", "cdn.htstreaming.com", "nhplayer.com"],
    headers: {
      Referer: "https://nhplayer.com/",
      Origin: "https://nhplayer.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: ["r2.1hanime.com", "cdn.htstreaming.com"],
    headers: {
      Referer: "https://nhplayer.com/",
      Origin: "https://nhplayer.com",
    },
  },
];

const bypassDomains = [
  "hentai.tv",
  "nhplayer.com",
  "1hanime.com",
  "animeidhentai.com",
  "r2.1hanime.com",
  "cdn.htstreaming.com",
];

// Register dynamic referer rules in StrawVerse StreamProxy
try {
  if (typeof global.setDynamicReferer === "function") {
    global.setDynamicReferer("r2.1hanime.com", "https://nhplayer.com/");
    global.setDynamicReferer("1hanime.com", "https://nhplayer.com/");
    global.setDynamicReferer("nhplayer.com", "https://hentai.tv/");
  }
  if (typeof global.setFallbackReferer === "function") {
    global.setFallbackReferer("https://nhplayer.com/");
  }
} catch (_) {}

function formatStreamUrl(rawUrl, referer = "https://nhplayer.com/") {
  if (!rawUrl) return "";
  const port = global.PORT || (process.platform === "android" ? 3459 : 3000);
  if (port) {
    const refParam = referer ? `&referer=${encodeURIComponent(referer)}` : "";
    return `http://127.0.0.1:${port}/api/stream/segment?url=${encodeURIComponent(rawUrl)}${refParam}`;
  }
  return rawUrl;
}

function extractSetCookies(headers) {
  if (!headers) return [];
  const raw =
    headers["set-cookie"] ||
    (typeof headers.get === "function" ? headers.get("set-cookie") : null);
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function updateCookieJar(cookieJar, headers) {
  if (!cookieJar) return;
  const rawCookies = extractSetCookies(headers);
  for (const c of rawCookies) {
    if (!c) continue;
    const pair = c.split(";")[0].trim();
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k && v) cookieJar.set(k, v);
    }
  }
}

function getCookieString(cookieJar) {
  if (!cookieJar) return "";
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Pure Node.js HTTPS request helper.
 * Completely immune to Android WebView bridge origin mismatches and header stripping.
 */
function directHttpsRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const headers = {
        Host: u.hostname,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(options.headers || {}),
      };

      if (options.cookieJar && !headers["Cookie"] && !headers["cookie"]) {
        const cStr = getCookieString(options.cookieJar);
        if (cStr) headers["Cookie"] = cStr;
      }

      const reqOptions = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers,
        agent: customTlsAgent || undefined,
        timeout: options.timeout || 20000,
      };

      const req = https.request(reqOptions, (res) => {
        if (options.cookieJar && res.headers["set-cookie"]) {
          updateCookieJar(options.cookieJar, res.headers);
        }

        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          (options.redirectCount || 0) < 5
        ) {
          const redirectUrl = new URL(res.headers.location, urlStr).toString();
          return resolve(
            directHttpsRequest(redirectUrl, {
              ...options,
              redirectCount: (options.redirectCount || 0) + 1,
            })
          );
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString("utf-8");
          let data;
          try {
            data = JSON.parse(text);
          } catch (_) {
            data = text;
          }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Direct HTTPS request timed out for ${urlStr}`));
      });

      req.on("error", reject);

      if (options.body) req.write(options.body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// HTTP helper with direct Node HTTPS primary and Axios fallback
async function httpGet(url, options = {}) {
  try {
    return await directHttpsRequest(url, options);
  } catch (err) {
    if (global.axios) {
      try {
        const axiosConfig = {
          headers: options.headers || {},
          timeout: options.timeout || 20000,
          strawverseDirectHttp: true,
          validateStatus: (status) => status < 400,
        };
        if (customTlsAgent) axiosConfig.httpsAgent = customTlsAgent;
        return await global.axios.get(url, axiosConfig);
      } catch (_) {}
    }
    throw err;
  }
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

function cleanSlug(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .replace(/^https?:\/\/[^\/]+\//i, "")
    .replace(/^(?:series|hentai|watch|video)\//i, "")
    .replace(/^(?:null|\d+)\//i, "")
    .replace(/^\/+|\/+$/g, "");
}

/**
 * Extracts and decodes Next.js App Router streaming RSC payloads.
 */
function extractRscPayload(html) {
  if (!html || typeof html !== "string") return "";
  const blocks = [...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs)];
  const raw = blocks.map((b) => b[1]).join("");
  try {
    return JSON.parse(`"${raw}"`);
  } catch (_) {
    return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function findEmbedUrl(html, rsc, epSlug) {
  if (html) {
    const iframeMatch =
      html.match(/<iframe[^>]+src="(https:\/\/nhplayer\.com\/v\/[a-zA-Z0-9]+\/?)"/i) ||
      html.match(/<iframe[^>]+data-src="(https:\/\/nhplayer\.com\/v\/[a-zA-Z0-9]+\/?)"/i);
    if (iframeMatch) return iframeMatch[1];
  }

  if (rsc && epSlug) {
    const rscSlugMatch =
      rsc.match(new RegExp(`"slug":"${epSlug}"[^{}]*"embedUrl":"(https:\\/\\/nhplayer\\.com\\/v\\/[a-zA-Z0-9]+\\/?)"`)) ||
      rsc.match(new RegExp(`"embedUrl":"(https:\\/\\/nhplayer\\.com\\/v\\/[a-zA-Z0-9]+\\/?)"[^{}]*"slug":"${epSlug}"`));
    if (rscSlugMatch) return rscSlugMatch[1];
  }

  const fallback =
    (html ? html.match(/https:\/\/nhplayer\.com\/v\/[a-zA-Z0-9]+\/?/) : null) ||
    (rsc ? rsc.match(/https:\/\/nhplayer\.com\/v\/[a-zA-Z0-9]+\/?/) : null);
  return fallback ? fallback[0] : null;
}

/**
 * Extracts episodes from Next.js RSC payload, filtering strictly by series slug
 * to avoid capturing recommendations/footer episodes.
 */
function extractEpisodesFromRsc(rscText, targetSlug, defaultCover) {
  const cleanTarget = String(targetSlug || "")
    .trim()
    .toLowerCase()
    .replace(/-episode-\d+$/, "");
  const episodes = [];
  const seenEps = new Set();

  const objRegex = /\{[^{}]*"slug":"([^"]+)"[^{}]*\}/g;
  let match;
  while ((match = objRegex.exec(rscText)) !== null) {
    const rawObj = match[0];
    const slugMatch = rawObj.match(/"slug":"([^"]+)"/);
    if (!slugMatch) continue;
    const epSlug = slugMatch[1];

    const titleSlugMatch = rawObj.match(/"titleSlug":"([^"]+)"/);
    const titleSlug = titleSlugMatch ? titleSlugMatch[1] : "";

    const isTarget =
      (titleSlug && titleSlug.toLowerCase() === cleanTarget) ||
      epSlug.toLowerCase().startsWith(cleanTarget);

    if (isTarget) {
      const epMatch = rawObj.match(/"ep":([0-9]+)/);
      const epNum = epMatch ? parseInt(epMatch[1], 10) : 1;
      const thumbMatch = rawObj.match(/"thumb":"([^"]+)"/);
      const thumb = thumbMatch ? thumbMatch[1] : null;

      if (!seenEps.has(epSlug)) {
        seenEps.add(epSlug);
        episodes.push({
          id: epSlug,
          number: epNum,
          title: `Episode ${epNum}`,
          image: thumb
            ? (thumb.startsWith("http") ? thumb : `${baseUrl}${thumb}`)
            : defaultCover,
          thumbnail: thumb
            ? (thumb.startsWith("http") ? thumb : `${baseUrl}${thumb}`)
            : defaultCover,
        });
      }
    }
  }

  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

/**
 * Search anime by keyword.
 */
async function SearchAnime(query, page = 1) {
  const pageNum = normalizePage(page);
  const q = String(query || "").trim();
  if (!q) {
    return { currentPage: pageNum, hasNextPage: false, totalPages: 0, results: [] };
  }

  try {
    // 1. Try official JSON search endpoint
    try {
      const searchUrl = `${baseUrl}/api/search?q=${encodeURIComponent(q)}`;
      const res = await httpGet(searchUrl, {
        headers: {
          Accept: "application/json",
          Referer: `${baseUrl}/search?q=${encodeURIComponent(q)}`,
        },
      });

      const data = typeof res.data === "object" ? res.data : JSON.parse(res.data || "{}");
      const videos = data.videos || [];
      if (videos.length > 0) {
        const results = [];
        const seen = new Set();

        for (const v of videos) {
          const seriesSlug = v.titleSlug || v.slug;
          if (seen.has(seriesSlug)) continue;
          seen.add(seriesSlug);

          const img = v.thumb || v.cover || v.featureImage;
          results.push({
            id: seriesSlug,
            title: v.title || seriesSlug,
            image: img ? (img.startsWith("http") ? img : `${baseUrl}${img}`) : null,
            cover: v.backdrop ? (v.backdrop.startsWith("http") ? v.backdrop : `${baseUrl}${v.backdrop}`) : null,
            rating: v.rating ? String(v.rating) : null,
            releaseDate: v.year ? String(v.year) : null,
            type: "Hentai",
            subDub: "Sub",
          });
        }

        return {
          currentPage: 1,
          hasNextPage: false,
          totalPages: 1,
          results,
        };
      }
    } catch (_) {}

    // 2. Fallback to RSC search page
    const url = `${baseUrl}/search?q=${encodeURIComponent(q)}`;
    const res = await httpGet(url, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    const results = [];
    const seen = new Set();
    const cleanQ = q.toLowerCase();

    const matches = rsc.matchAll(
      /\{[^{}]*"slug":"([^"]+)"[^{}]*"title":"([^"]+)"(?:[^{}]*"thumb":"([^"]+)")?[^{}]*\}/g
    );

    for (const m of matches) {
      const slug = m[1];
      const title = m[2];
      const thumb = m[3] || null;

      if (!seen.has(slug) && !slug.includes("search") && title !== "Page not found") {
        if (title.toLowerCase().includes(cleanQ) || slug.toLowerCase().includes(cleanQ)) {
          seen.add(slug);
          const image = thumb
            ? (thumb.startsWith("http") ? thumb : `${baseUrl}${thumb}`)
            : null;

          results.push({
            id: slug,
            title,
            image,
            type: "Hentai",
            subDub: "Sub",
          });
        }
      }
    }

    return {
      currentPage: pageNum,
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    console.error("HentaiTv SearchAnime error:", err.message);
    return { currentPage: pageNum, hasNextPage: false, totalPages: 0, results: [] };
  }
}

/**
 * Fetch detailed anime or episode information.
 */
async function AnimeInfo(id) {
  const slug = cleanSlug(id);
  const cleanTargetSlug = slug.replace(/-episode-\d+$/, "");

  const animeInfo = {
    id: cleanTargetSlug || slug,
    title: slug,
    image: null,
    cover: null,
    description: "",
    genres: [],
    type: "Hentai",
    status: "Completed",
    brand: "Unknown",
    rating: 0,
    totalEpisodes: 1,
    episodes: [],
  };

  try {
    let html = "";
    let rsc = "";
    try {
      const sRes = await httpGet(`${baseUrl}/series/${cleanTargetSlug}`, {
        headers: { Referer: `${baseUrl}/` },
      });
      html = typeof sRes.data === "string" ? sRes.data : "";
      rsc = extractRscPayload(html);
    } catch (_) {}

    if (!rsc) {
      const res = await httpGet(`${baseUrl}/hentai/${slug}`, {
        headers: { Referer: `${baseUrl}/` },
      });
      html = typeof res.data === "string" ? res.data : "";
      rsc = extractRscPayload(html);
    }

    const titleMatch =
      rsc.match(new RegExp(`"titleSlug":"${cleanTargetSlug}"[^{}]*"title":"([^"]+)"`)) ||
      rsc.match(new RegExp(`"title":"([^"]+)"[^{}]*"titleSlug":"${cleanTargetSlug}"`)) ||
      (html ? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) : null) ||
      (html ? html.match(/<title>([\s\S]*?)<\/title>/i) : null) ||
      rsc.match(/"name":"([^"]+)"/) ||
      rsc.match(/"title":"([^"]+)"/);

    if (titleMatch) {
      const rawTitle = titleMatch[1].replace(/<[^>]+>/g, "").split(/[—\-|]/)[0].trim();
      if (rawTitle && rawTitle !== "Next.MetadataOutlet" && rawTitle !== "Page not found") {
        animeInfo.title = rawTitle;
      }
    }

    const descMatch = rsc.match(/"description":"([^"]+)"/);
    if (descMatch) {
      animeInfo.description = descMatch[1];
    }

    const brandMatch = rsc.match(/"brand":"([^"]+)"/);
    if (brandMatch) {
      animeInfo.brand = brandMatch[1];
    }

    const ratingMatch = rsc.match(/"rating":([0-9.]+)/);
    if (ratingMatch) {
      animeInfo.rating = parseFloat(ratingMatch[1]) || 0;
    }

    const thumbMatch = rsc.match(/"thumb":"([^"]+)"/) || rsc.match(/"cover":"([^"]+)"/);
    if (thumbMatch) {
      animeInfo.image = thumbMatch[1].startsWith("http")
        ? thumbMatch[1]
        : `${baseUrl}${thumbMatch[1]}`;
    }

    const backdropMatch = rsc.match(/"backdrop":"([^"]+)"/);
    if (backdropMatch) {
      animeInfo.cover = backdropMatch[1].startsWith("http")
        ? backdropMatch[1]
        : `${baseUrl}${backdropMatch[1]}`;
    }

    const tagsMatch = rsc.match(/"tags":\[(.*?)\]/);
    if (tagsMatch) {
      try {
        animeInfo.genres = JSON.parse(`[${tagsMatch[1]}]`);
      } catch (_) {}
    }

    // Extract episodes strictly matching this series
    const episodes = extractEpisodesFromRsc(rsc, cleanTargetSlug, animeInfo.image);

    // Fallback: single episode if series had no episode cards
    if (episodes.length === 0) {
      const epNumMatch = rsc.match(/"ep":([0-9]+)/);
      const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;
      episodes.push({
        id: slug,
        number: epNum,
        title: `Episode ${epNum}`,
        image: animeInfo.image,
        thumbnail: animeInfo.image,
      });
    }

    animeInfo.episodes = episodes;
    animeInfo.totalEpisodes = episodes.length;

    return animeInfo;
  } catch (err) {
    console.error("HentaiTv AnimeInfo error:", err.message);
    return animeInfo;
  }
}

/**
 * Fetch episode list.
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
    console.error("HentaiTv fetchEpisode error:", err.message);
    return { episodes: [], totalPages: 0, total: 0, currentPage: page };
  }
}

/**
 * Solve NHPlayer challenge to retrieve direct MP4 stream URL.
 * Uses direct Node.js HTTPS engine to completely bypass Android WebView bridge issues.
 */
async function solveNhPlayer(embedUrl) {
  if (!embedUrl || typeof embedUrl !== "string") {
    throw new Error("Invalid NHPlayer embed URL.");
  }
  const playerUrl = embedUrl.endsWith("/") ? embedUrl : `${embedUrl}/`;
  const cookieJar = new Map();

  // 1. Fetch embed page
  const res1 = await directHttpsRequest(playerUrl, {
    headers: { Referer: `${baseUrl}/` },
    cookieJar,
  });
  const html1 = typeof res1.data === "string" ? res1.data : "";

  const playerPathMatch =
    html1.match(/data-id="(\/player\.php\?[^"]+)"/) ||
    html1.match(/src="(\/player\.php\?[^"]+)"/) ||
    html1.match(/data-id="([^"]+)"/);

  if (!playerPathMatch) {
    throw new Error(`player.php endpoint not found in ${embedUrl}`);
  }
  const playerPath = playerPathMatch[1];

  let subtitleUrl = null;
  const subMatch = playerPath.match(/&s=([a-zA-Z0-9%_\-=]+)/);
  if (subMatch) {
    try {
      subtitleUrl = Buffer.from(decodeURIComponent(subMatch[1]), "base64").toString("utf-8");
    } catch (_) {}
  }

  const fullPlayerUrl = playerPath.startsWith("http")
    ? playerPath
    : `https://nhplayer.com${playerPath}`;

  // 2. Fetch player.php
  const res2 = await directHttpsRequest(fullPlayerUrl, {
    headers: { Referer: playerUrl },
    cookieJar,
  });
  const pHtml = typeof res2.data === "string" ? res2.data : "";

  // Extract v2 challenge parameters safely
  const vidMatch = pHtml.match(/vid:"([^"]+)"/) || pHtml.match(/name="vid"\s+value="([^"]+)"/);
  const ctMatch = pHtml.match(/ct:"([^"]+)"/) || pHtml.match(/name="c"\s+value="([^"]+)"/);
  const pidMatch = pHtml.match(/pid:"([^"]+)"/) || pHtml.match(/name="pid"\s+value="([^"]+)"/);
  const stMatch = pHtml.match(/st:"([^"]+)"/) || pHtml.match(/name="st"\s+value="([^"]+)"/);
  const coreMatch = pHtml.match(/src="(player-core-v2\.php\?[^"]+)"/);

  if (vidMatch && coreMatch) {
    const coreUrl = `https://nhplayer.com/${coreMatch[1]}`;
    const res3 = await directHttpsRequest(coreUrl, {
      headers: { Referer: fullPlayerUrl },
      cookieJar,
    });
    const coreJs = typeof res3.data === "string" ? res3.data : "";

    const scMatch =
      coreJs.match(/var\s+_[a-zA-Z0-9]+\s*=\s*[\x27"]([0-9a-f]+\.[0-9a-f]+)[\x27"]/) ||
      coreJs.match(/var\s+_[a-zA-Z0-9]+\s*=\s*[\x27"]([a-f0-9]{8}\.[a-f0-9]{16})[\x27"]/);
    const ridMatch =
      coreJs.match(/var\s+_[a-zA-Z0-9]+\s*=\s*[\x27"]([0-9a-f]{16})[\x27"]/);

    const sc = scMatch ? scMatch[1] : "";
    const rid = ridMatch ? ridMatch[1] : "";

    const elemIds = [...coreJs.matchAll(/getElementById\([\x27"]([^\x27"]+)[\x27"]\)/g)].map((m) => m[1]);

    if (elemIds.length >= 5) {
      const [e1Id, e2Id, e3Id, e4Id, e5Id] = elemIds;

      const p1Match =
        pHtml.match(new RegExp(`id="${e1Id}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
        pHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${e1Id}"`));
      const p1 = p1Match ? p1Match[1] : "";

      const p2Match =
        pHtml.match(new RegExp(`id="${e2Id}"[^>]*value="([^"]+)"`)) ||
        pHtml.match(new RegExp(`value="([^"]+)"[^>]*id="${e2Id}"`));
      const p2 = p2Match ? p2Match[1] : "";

      const p3Match =
        pHtml.match(new RegExp(`id="${e3Id}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
        pHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${e3Id}"`));
      const p3 = p3Match ? p3Match[1] : "";

      const p4Match =
        pHtml.match(new RegExp(`id="${e4Id}"[^>]*><p>([^<]+)</p>`)) ||
        pHtml.match(new RegExp(`<template[^>]+id="${e4Id}"[^>]*>([\\s\\S]*?)<\\/template>`)) ||
        pHtml.match(new RegExp(`id="${e4Id}"[^>]*>([\\s\\S]*?)<\\/`));
      const p4 = p4Match ? p4Match[1].replace(/<[^>]+>/g, "").trim() : "";

      const e5Match =
        pHtml.match(new RegExp(`id="${e5Id}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
        pHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${e5Id}"`));
      const ts = e5Match ? e5Match[1] : "";

      if (p1 && p2 && p3 && p4 && ts) {
        const challenge = p1 + p2 + p3 + p4 + ts;
        let n = 0;
        let pow = null;
        while (n < 10000000) {
          const hash = crypto.createHash("sha256").update(challenge + n.toString(16)).digest();
          if (hash[0] === 0) {
            pow = n.toString(16);
            break;
          }
          n++;
        }

        await new Promise((r) => setTimeout(r, 800));

        const fpData = {
          t: 1200,
          mm: [
            [200, 300, 100],
            [250, 350, 250],
          ],
          tm: [],
          cl: [[250, 350, 300]],
          kp: [],
          sc: [],
          i: 1,
          mc: 10,
          tc: 0,
          cc: 1,
          kc: 0,
          b: {
            w: "ANGLE (Intel, Mesa Intel UHD Graphics 630, OpenGL 4.6)",
            v: "Google Inc. (Intel)",
            sw: 1920,
            sh: 1080,
            aw: 1920,
            ah: 1040,
            cd: 24,
            pd: 24,
            tz: 0,
            hc: 8,
            dm: 8,
            pl: "Linux x86_64",
            lang: "en-US",
            langs: "en-US,en",
            dpr: 1,
            ww: 1920,
            wh: 960,
            touch: false,
            pdf: true,
            fonts: 25,
          },
        };
        const fpB64 = Buffer.from(JSON.stringify(fpData)).toString("base64");

        const params = new URLSearchParams({
          vid: vidMatch[1],
          c: ctMatch ? ctMatch[1] : "",
          p1,
          p2,
          p3,
          p4,
          t: ts,
          sc,
          rid,
          fp: fpB64,
          df: "",
          pow: pow || "",
          pid: pidMatch ? pidMatch[1] : "",
          st: stMatch ? stMatch[1] : "",
        });

        const apiUrl = `https://nhplayer.com/get-video-url-v2.php?${params.toString()}`;
        const res4 = await directHttpsRequest(apiUrl, {
          headers: {
            Referer: fullPlayerUrl,
            "X-Requested-With": "XMLHttpRequest",
          },
          cookieJar,
        });

        const subtMatch = pHtml.match(/src:\s*"([^"]+\.srt)"/);
        if (!subtitleUrl && subtMatch) {
          subtitleUrl = subtMatch[1];
        }

        const data = typeof res4.data === "object" ? res4.data : JSON.parse(res4.data || "{}");
        if (data && data.url) {
          return {
            streamUrl: data.url,
            subtitleUrl,
          };
        }
      }
    }
  }

  // Fallback to classic v1 token solver
  const token1 = (pHtml.match(/name="v_token"\s+value="([^"]+)"/) || html1.match(/name="v_token"\s+value="([^"]+)"/) || [])[1];
  const token2 = (pHtml.match(/name="v_token2"\s+value="([^"]+)"/) || html1.match(/name="v_token2"\s+value="([^"]+)"/) || [])[1];
  const token3 = (pHtml.match(/name="v_token3"\s+value="([^"]+)"/) || html1.match(/name="v_token3"\s+value="([^"]+)"/) || [])[1];
  const token4 = (pHtml.match(/name="v_token4"\s+value="([^"]+)"/) || html1.match(/name="v_token4"\s+value="([^"]+)"/) || [])[1];
  const token5 = (pHtml.match(/name="v_token5"\s+value="([^"]+)"/) || html1.match(/name="v_token5"\s+value="([^"]+)"/) || [])[1];

  if (token1 && token2 && token3 && token4 && token5) {
    const challengeUrl = `https://nhplayer.com/challenge.php?v=${encodeURIComponent(token1)}`;
    const resCh = await directHttpsRequest(challengeUrl, {
      headers: {
        Referer: fullPlayerUrl,
        "X-Requested-With": "XMLHttpRequest",
      },
      cookieJar,
    });
    const sigData = typeof resCh.data === "object" ? resCh.data : JSON.parse(resCh.data || "{}");
    const signature = sigData.x_signature;
    if (signature) {
      const powUrl = "https://nhplayer.com/pow-challenge.php";
      const resPow = await directHttpsRequest(powUrl, {
        headers: {
          Referer: fullPlayerUrl,
          "X-Requested-With": "XMLHttpRequest",
        },
        cookieJar,
      });
      const powData = typeof resPow.data === "object" ? resPow.data : JSON.parse(resPow.data || "{}");
      const { prefix, difficulty } = powData;
      const targetZeros = "0".repeat(difficulty || 4);
      let nonce = 0;
      let solvedHash = "";
      while (true) {
        const testStr = `${prefix}${nonce}`;
        const hash = crypto.createHash("sha256").update(testStr).digest("hex");
        if (hash.startsWith(targetZeros)) {
          solvedHash = hash;
          break;
        }
        nonce++;
        if (nonce > 5000000) break;
      }
      const params = new URLSearchParams({
        v_token: token1,
        v_token2: token2,
        v_token3: token3,
        v_token4: token4,
        v_token5: token5,
        x_signature: signature,
        nhp_pow: `${prefix}|${nonce}|${solvedHash}`,
      });
      const apiUrl = `https://nhplayer.com/get-video-url.php?${params.toString()}`;
      const resFinal = await directHttpsRequest(apiUrl, {
        headers: {
          Referer: fullPlayerUrl,
          "X-Requested-With": "XMLHttpRequest",
        },
        cookieJar,
      });
      const d = typeof resFinal.data === "object" ? resFinal.data : JSON.parse(resFinal.data || "{}");
      if (d && d.url) {
        return { streamUrl: d.url, subtitleUrl };
      }
    }
  }

  throw new Error(`Failed to resolve NHPlayer stream from embed (${embedUrl})`);
}

/**
 * Fetch video sources and subtitles for a specific episode.
 */
async function fetchEpisodeSources(episodeId, category = null) {
  try {
    installStreamProxyInterceptor();
    const epSlug = cleanSlug(episodeId);
    let episodeUrl = `${baseUrl}/hentai/${epSlug}`;

    let res = await httpGet(episodeUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    let html = typeof res.data === "string" ? res.data : "";
    let rsc = extractRscPayload(html);

    let embedUrl = findEmbedUrl(html, rsc, epSlug);

    if (!embedUrl) {
      // Check series page
      const seriesUrl = `${baseUrl}/series/${epSlug}`;
      res = await httpGet(seriesUrl, {
        headers: { Referer: `${baseUrl}/` },
      });
      html = typeof res.data === "string" ? res.data : "";
      rsc = extractRscPayload(html);
      embedUrl = findEmbedUrl(html, rsc, epSlug);
    }

    if (!embedUrl) {
      // Resolve first episode via AnimeInfo
      const info = await AnimeInfo(epSlug);
      if (info.episodes && info.episodes.length > 0 && info.episodes[0].id !== epSlug) {
        return await fetchEpisodeSources(info.episodes[0].id, category);
      }
    }

    if (!embedUrl) {
      console.warn("No NHPlayer embed found for episode:", epSlug);
      return { sources: [], subtitles: [] };
    }

    const resolved = await solveNhPlayer(embedUrl);

    // Register stream headers for StrawVerse native playback
    try {
      if (resolved.streamUrl) {
        const cdnDomain = new URL(resolved.streamUrl).hostname;
        if (typeof global.setDynamicReferer === "function") {
          global.setDynamicReferer(cdnDomain, "https://nhplayer.com/");
          global.setDynamicReferer("r2.1hanime.com", "https://nhplayer.com/");
          global.setDynamicReferer("1hanime.com", "https://nhplayer.com/");
          global.setDynamicReferer("nhplayer.com", `${baseUrl}/`);
        }
        if (typeof global.setFallbackReferer === "function") {
          global.setFallbackReferer("https://nhplayer.com/");
        }
      }
    } catch (_) {}

    const proxyStreamUrl = formatStreamUrl(resolved.streamUrl, "https://nhplayer.com/");
    const sources = [
      {
        name: "NHPlayer (1080p)",
        quality: "1080p",
        url: proxyStreamUrl,
        rawUrl: resolved.streamUrl,
        isM3U8: false,
        type: "mp4",
        headers: {
          Referer: "https://nhplayer.com/",
          Origin: "https://nhplayer.com",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      },
    ];

    const subtitles = resolved.subtitleUrl
      ? [
          {
            url: resolved.subtitleUrl,
            lang: "English",
          },
        ]
      : [];

    return { sources, subtitles };
  } catch (err) {
    console.error("HentaiTv fetchEpisodeSources error:", err.message);
    return { sources: [], subtitles: [] };
  }
}

/**
 * Fetch recent / browse episodes.
 */
async function fetchRecentEpisodes(page = 1) {
  const pageNum = normalizePage(page);
  try {
    // 1. Try official JSON browse API (supports clean server-side pagination)
    try {
      const apiUrl = `${baseUrl}/api/browse?page=${pageNum}`;
      const res = await httpGet(apiUrl, {
        headers: {
          Accept: "application/json",
          Referer: `${baseUrl}/browse`,
        },
      });

      const data = typeof res.data === "object" ? res.data : JSON.parse(res.data || "{}");
      const videos = data.videos || [];
      if (videos.length > 0) {
        const results = videos.map((v) => {
          const thumb = v.thumb || v.cover || v.featureImage;
          const image = thumb
            ? (thumb.startsWith("http") ? thumb : `${baseUrl}${thumb}`)
            : null;
          return {
            id: v.slug || v.titleSlug,
            title: v.title || v.slug,
            episode: typeof v.ep === "number" ? v.ep : 1,
            image,
            type: "Hentai",
            subDub: v.language || "Sub",
          };
        });

        const totalPages = typeof data.pages === "number" ? data.pages : 126;
        return {
          currentPage: pageNum,
          current_page: pageNum,
          page: pageNum,
          hasNextPage: pageNum < totalPages,
          totalPages,
          results,
        };
      }
    } catch (_) {}

    // 2. Fallback to RSC browse scraping
    const url = pageNum === 1 ? `${baseUrl}/browse` : `${baseUrl}/browse?page=${pageNum}`;
    const res = await httpGet(url, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    const results = [];
    const seen = new Set();

    const matches = rsc.matchAll(
      /\{[^{}]*"slug":"([^"]+)"[^{}]*"title":"([^"]+)"(?:[^{}]*"thumb":"([^"]+)")?(?:[^{}]*"ep":([0-9]+))?[^{}]*\}/g
    );

    for (const m of matches) {
      const slug = m[1];
      const title = m[2];
      const thumb = m[3] || null;
      const epNum = m[4] ? parseInt(m[4], 10) : 1;

      if (!seen.has(slug) && title !== "Page not found") {
        seen.add(slug);
        const image = thumb
          ? (thumb.startsWith("http") ? thumb : `${baseUrl}${thumb}`)
          : null;

        results.push({
          id: slug,
          title,
          episode: epNum,
          image,
          type: "Hentai",
          subDub: "Sub",
        });
      }
    }

    const finalResults =
      pageNum > 1 && results.length > 8 ? results.slice(8) : results;

    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      hasNextPage: finalResults.length >= 20,
      totalPages: 100,
      results: finalResults,
    };
  } catch (err) {
    console.error("HentaiTv fetchRecentEpisodes error:", err.message);
    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      hasNextPage: false,
      totalPages: 0,
      results: [],
    };
  }
}

/**
 * Fetch trending episodes.
 */
async function fetchTrending(page = 1) {
  try {
    const url = `${baseUrl}/trending`;
    const res = await httpGet(url, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    const results = [];
    const seen = new Set();

    const matches = rsc.matchAll(
      /\{[^{}]*"slug":"([^"]+)"[^{}]*"title":"([^"]+)"(?:[^{}]*"thumb":"([^"]+)")?(?:[^{}]*"ep":([0-9]+))?[^{}]*\}/g
    );

    for (const m of matches) {
      const slug = m[1];
      const title = m[2];
      const thumb = m[3] || null;
      const epNum = m[4] ? parseInt(m[4], 10) : 1;

      if (!seen.has(slug) && title !== "Page not found") {
        seen.add(slug);
        const image = thumb
          ? (thumb.startsWith("http") ? thumb : `${baseUrl}${thumb}`)
          : null;

        results.push({
          id: slug,
          title,
          episode: epNum,
          image,
          type: "Hentai",
          subDub: "Sub",
        });
      }
    }

    return {
      currentPage: 1,
      current_page: 1,
      page: 1,
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    console.error("HentaiTv fetchTrending error:", err.message);
    return {
      currentPage: 1,
      current_page: 1,
      page: 1,
      hasNextPage: false,
      totalPages: 0,
      results: [],
    };
  }
}

function getHeaders(url) {
  if (!url) return null;
  const lower = String(url).toLowerCase();
  if (
    lower.includes("r2.1hanime.com") ||
    lower.includes("1hanime.com") ||
    lower.includes("animeidhentai.com") ||
    lower.includes("htstreaming.com") ||
    lower.includes("nhplayer.com")
  ) {
    return {
      Referer: "https://nhplayer.com/",
      Origin: "https://nhplayer.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };
  }
  return null;
}

module.exports = {
  name: "hentaitv",
  version: "1.0.7",
  baseUrl,
  headerRules,
  subrequestHeaders,
  bypassDomains,
  getHeaders,
  SearchAnime,
  SearchMovie: SearchAnime,
  AnimeInfo,
  MovieInfo: AnimeInfo,
  fetchEpisode,
  fetchEpisodeSources,
  fetchRecentEpisodes,
  fetchTrending,
};
