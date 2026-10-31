/**
 * StrawVerse Extension - 1hanime (AnimeIDHentai) Scraper & Stream Resolver
 * Features:
 *  - Native Next.js App Router RSC parser & direct Search API integration
 *  - Reverse-engineered NHPlayer challenge solver (DOM token extraction + client-side PoW)
 *  - Direct 1080p MP4 stream resolution with byte-range seeking
 *  - Automated English subtitle (.srt) extraction
 *  - Dynamic Referer & Origin header rules for Cloudflare R2 CDN bypass
 */

const crypto = require("crypto");
const https = require("https");
const tls = require("tls");

let customTlsAgent = null;
try {
  customTlsAgent = new https.Agent({
    ciphers: tls.DEFAULT_CIPHERS,
    minVersion: "TLSv1.3",
    keepAlive: true,
  });
} catch (_) {}

function installStreamProxyInterceptor() {
  if (!global.axios || global.__nhStreamProxyInterceptorInstalled) return;
  global.__nhStreamProxyInterceptorInstalled = true;

  global.axios.interceptors.request.use(
    (config) => {
      try {
        const urlStr = String(config.url || "").toLowerCase();
        // ONLY bypass Android Capacitor bridge for the heavy CDN media files
        if (urlStr.includes("r2.1hanime.com") || urlStr.includes("cdn.htstreaming.com")) {
          config.strawverseDirectHttp = true;

          if (customTlsAgent) {
            config.httpsAgent = customTlsAgent;
          }

          try {
            const u = new URL(config.url);
            config.headers = {
              ...(config.headers || {}),
              Host: u.hostname,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              Referer: "https://nhplayer.com/",
              Origin: "https://nhplayer.com",
              Accept: "*/*",
              ...(config.headers?.["Range"] || config.headers?.["range"]
                ? { Range: config.headers?.["Range"] || config.headers?.["range"] }
                : {}),
            };
          } catch (_) {}
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

const baseUrl = "https://animeidhentai.com";
const aliasUrl = "https://1hanime.com";

// Declarative header rules for StrawVerse network stack
const headerRules = [
  {
    match: [
      "1hanime",
      "1hanime.com",
      "animeidhentai",
      "animeidhentai.com",
      "nhplayer",
      "nhplayer.com",
      "r2.1hanime.com",
      "htstreaming",
      "cdn.htstreaming.com",
    ],
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
    match: [
      "1hanime",
      "1hanime.com",
      "r2.1hanime.com",
      "htstreaming",
      "cdn.htstreaming.com",
    ],
    headers: {
      Referer: "https://nhplayer.com/",
      Origin: "https://nhplayer.com",
    },
  },
];

const bypassDomains = [
  "1hanime.com",
  "animeidhentai.com",
  "nhplayer.com",
  "r2.1hanime.com",
  "htstreaming.com",
  "cdn.htstreaming.com",
];

// Register dynamic referer rules in StrawVerse StreamProxy
try {
  if (typeof global.setDynamicReferer === "function") {
    global.setDynamicReferer("r2.1hanime.com", "https://nhplayer.com/");
    global.setDynamicReferer("1hanime.com", "https://nhplayer.com/");
    global.setDynamicReferer("animeidhentai.com", "https://nhplayer.com/");
    global.setDynamicReferer("nhplayer.com", "https://animeidhentai.com/");
  }
  if (typeof global.setFallbackReferer === "function") {
    global.setFallbackReferer("https://nhplayer.com/");
  }
} catch (_) {}

// HTTP helper compatible with StrawVerse global.axios and native fetch
async function httpGet(url, options = {}) {
  const reqHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...(options.headers || {}),
  };

  if (global.axios) {
    try {
      return await global.axios.get(url, {
        headers: reqHeaders,
        timeout: options.timeout || 20000,
        validateStatus: (status) => status < 400,
      });
    } catch (err) {
      if (!options._retry) {
        return httpGet(url, { ...options, _retry: true });
      }
      throw err;
    }
  }

  const timeoutMs = options.timeout || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers: reqHeaders, signal: controller.signal });
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

function cleanSlug(slug) {
  if (!slug) return "";
  return String(slug)
    .trim()
    .replace(/^https?:\/\/[^\/]+\//i, "")
    .replace(/^(?:series|hentai|watch|video)\//i, "")
    .replace(/^(?:null|\d+)\//i, "")
    .replace(/^\/+|\/+$/g, "");
}

function normalizeImageUrl(img) {
  if (!img) return "";
  if (img.startsWith("http://") || img.startsWith("https://")) {
    return img;
  }
  if (img.startsWith("/")) {
    return `${baseUrl}${img}`;
  }
  return `${baseUrl}/${img}`;
}

function normalizePage(page) {
  const p = parseInt(page, 10);
  return isNaN(p) || p < 1 ? 1 : p;
}

function extractRscPayload(html) {
  if (!html || typeof html !== "string") return "";
  const pushes = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs),
  ].map((m) => m[1]);
  if (pushes.length === 0) return html;
  const raw = pushes.join("");
  try {
    return JSON.parse(`"${raw}"`);
  } catch (_) {
    return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
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
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
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
          image: thumb ? normalizeImageUrl(thumb) : defaultCover,
          thumbnail: thumb ? normalizeImageUrl(thumb) : defaultCover,
        });
      }
    }
  }

  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

/**
 * Universal NHPlayer challenge solver.
 * Handles both v2 randomized DOM selectors + PoW and classic v1 challenge tokens.
 */
async function solveNhPlayer(embedUrl) {
  if (!embedUrl || typeof embedUrl !== "string") {
    throw new Error("Invalid NHPlayer embed URL.");
  }
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const playerUrl = embedUrl.endsWith("/") ? embedUrl : `${embedUrl}/`;
  const cookieJar = new Map();

  // 1. Fetch embed page
  const res1 = await httpGet(playerUrl, {
    headers: { "User-Agent": ua, Referer: `${baseUrl}/` },
  });
  updateCookieJar(cookieJar, res1.headers);
  const pageHtml = typeof res1.data === "string" ? res1.data : "";

  const dataIdMatch =
    pageHtml.match(/data-id="(\/player\.php\?[^"]+)"/) ||
    pageHtml.match(/src="(\/player\.php\?[^"]+)"/) ||
    pageHtml.match(/data-id="([^"]+)"/);

  if (!dataIdMatch) {
    throw new Error(`player.php endpoint not found in embed (${embedUrl})`);
  }
  const playerPath = dataIdMatch[1];

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
  const resPlayer = await httpGet(fullPlayerUrl, {
    headers: {
      "User-Agent": ua,
      Referer: playerUrl,
      Cookie: getCookieString(cookieJar),
    },
  });
  updateCookieJar(cookieJar, resPlayer.headers);
  const playerHtml = typeof resPlayer.data === "string" ? resPlayer.data : "";

  // Extract v2 challenge parameters safely
  const vidMatch = playerHtml.match(/vid:"([^"]+)"/) || playerHtml.match(/name="vid"\s+value="([^"]+)"/);
  const ctMatch = playerHtml.match(/ct:"([^"]+)"/) || playerHtml.match(/name="c"\s+value="([^"]+)"/);
  const pidMatch = playerHtml.match(/pid:"([^"]+)"/) || playerHtml.match(/name="pid"\s+value="([^"]+)"/);
  const stMatch = playerHtml.match(/st:"([^"]+)"/) || playerHtml.match(/name="st"\s+value="([^"]+)"/);
  const coreMatch = playerHtml.match(/src="(player-core-v2\.php\?[^"]+)"/);

  if (vidMatch && coreMatch) {
    const coreUrl = `https://nhplayer.com/${coreMatch[1]}`;
    const resCore = await httpGet(coreUrl, {
      headers: {
        "User-Agent": ua,
        Referer: fullPlayerUrl,
        Cookie: getCookieString(cookieJar),
      },
    });
    updateCookieJar(cookieJar, resCore.headers);
    const coreJs = typeof resCore.data === "string" ? resCore.data : "";

    const scMatch =
      coreJs.match(/var\s+_[a-zA-Z0-9]+\s*=\s*['"]([0-9a-f]+\.[0-9a-f]+)['"]/) ||
      coreJs.match(/var\s+_[a-zA-Z0-9]+\s*=\s*['"]([a-f0-9]{8}\.[a-f0-9]{16})['"]/);
    const ridMatch =
      coreJs.match(/var\s+_[a-zA-Z0-9]+\s*=\s*['"]([0-9a-f]{16})['"]/);

    const sc = scMatch ? scMatch[1] : "";
    const rid = ridMatch ? ridMatch[1] : "";

    const elemIds = [...coreJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);

    if (elemIds.length >= 5) {
      const [id1, id2, id3, id4, id5] = elemIds;

      const p1Match =
        playerHtml.match(new RegExp(`id="${id1}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
        playerHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${id1}"`));
      const p1 = p1Match ? p1Match[1] : "";

      const p2Match =
        playerHtml.match(new RegExp(`id="${id2}"[^>]*value="([^"]+)"`)) ||
        playerHtml.match(new RegExp(`value="([^"]+)"[^>]*id="${id2}"`));
      const p2 = p2Match ? p2Match[1] : "";

      const p3Match =
        playerHtml.match(new RegExp(`id="${id3}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
        playerHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${id3}"`));
      const p3 = p3Match ? p3Match[1] : "";

      const p4Match =
        playerHtml.match(new RegExp(`id="${id4}"[^>]*><p>([^<]+)</p>`)) ||
        playerHtml.match(new RegExp(`<template[^>]+id="${id4}"[^>]*>([\\s\\S]*?)<\\/template>`)) ||
        playerHtml.match(new RegExp(`id="${id4}"[^>]*>([\\s\\S]*?)<\\/`));
      const p4 = p4Match ? p4Match[1].replace(/<[^>]+>/g, "").trim() : "";

      const el5Match =
        playerHtml.match(new RegExp(`id="${id5}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
        playerHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${id5}"`));
      const ts = el5Match ? el5Match[1] : "";

      if (p1 && p2 && p3 && p4 && ts) {
        const powChallenge = p1 + p2 + p3 + p4 + ts;
        let nonce = 0;
        let pow = null;
        while (nonce < 10000000) {
          const hexNonce = nonce.toString(16);
          const hash = crypto
            .createHash("sha256")
            .update(powChallenge + hexNonce)
            .digest();
          if (hash[0] === 0) {
            pow = hexNonce;
            break;
          }
          nonce++;
        }

        await new Promise((r) => setTimeout(r, 800));

        const fpData = {
          t: 1200,
          mm: [[100, 200, 300]],
          tm: [],
          cl: [[100, 200, 350]],
          kp: [],
          sc: [],
          i: 1,
          mc: 1,
          tc: 0,
          cc: 1,
          kc: 0,
          b: {
            sw: 1920,
            sh: 1080,
            aw: 1920,
            ah: 1040,
            cd: 24,
            pd: 24,
            tz: -120,
            hc: 8,
            dm: 8,
            pl: "Linux x86_64",
            lang: "en-US",
            langs: "en-US,en",
            dpr: 1,
            ww: 1920,
            wh: 950,
            touch: false,
            pdf: true,
            fonts: 0,
          },
        };
        const fp = Buffer.from(JSON.stringify(fpData)).toString("base64");

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
          fp,
          df: "",
          pow: pow || "",
          pid: pidMatch ? pidMatch[1] : "",
          st: stMatch ? stMatch[1] : "",
        });

        const apiUrl = `https://nhplayer.com/get-video-url-v2.php?${params.toString()}`;
        const resApi = await httpGet(apiUrl, {
          headers: {
            "User-Agent": ua,
            Referer: fullPlayerUrl,
            Cookie: getCookieString(cookieJar),
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        const data =
          typeof resApi.data === "object"
            ? resApi.data
            : JSON.parse(resApi.data || "{}");

        const subtMatch = playerHtml.match(/src:\s*"([^"]+\.srt)"/);
        if (!subtitleUrl && subtMatch) {
          subtitleUrl = subtMatch[1];
        }

        if (data && data.url) {
          return {
            streamUrl: data.url,
            subtitleUrl,
          };
        }
      }
    }
  }

  // Classic v1 challenge solver
  const token1 = (playerHtml.match(/name="v_token"\s+value="([^"]+)"/) || pageHtml.match(/name="v_token"\s+value="([^"]+)"/) || [])[1];
  const token2 = (playerHtml.match(/name="v_token2"\s+value="([^"]+)"/) || pageHtml.match(/name="v_token2"\s+value="([^"]+)"/) || [])[1];
  const token3 = (playerHtml.match(/name="v_token3"\s+value="([^"]+)"/) || pageHtml.match(/name="v_token3"\s+value="([^"]+)"/) || [])[1];
  const token4 = (playerHtml.match(/name="v_token4"\s+value="([^"]+)"/) || pageHtml.match(/name="v_token4"\s+value="([^"]+)"/) || [])[1];
  const token5 = (playerHtml.match(/name="v_token5"\s+value="([^"]+)"/) || pageHtml.match(/name="v_token5"\s+value="([^"]+)"/) || [])[1];

  if (token1 && token2 && token3 && token4 && token5) {
    const subtMatch = pageHtml.match(/src:\s*"([^"]+\.srt)"/);
    if (!subtitleUrl && subtMatch) {
      subtitleUrl = subtMatch[1];
    }

    const challengeUrl = `https://nhplayer.com/challenge.php?v=${encodeURIComponent(token1)}`;
    const res2 = await httpGet(challengeUrl, {
      headers: {
        "User-Agent": ua,
        Referer: fullPlayerUrl,
        Cookie: getCookieString(cookieJar),
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    updateCookieJar(cookieJar, res2.headers);

    const sigData =
      typeof res2.data === "object" ? res2.data : JSON.parse(res2.data || "{}");
    const signature = sigData.x_signature;
    if (signature) {
      const powUrl = "https://nhplayer.com/pow-challenge.php";
      const res3 = await httpGet(powUrl, {
        headers: {
          "User-Agent": ua,
          Referer: fullPlayerUrl,
          Cookie: getCookieString(cookieJar),
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      updateCookieJar(cookieJar, res3.headers);

      const powData =
        typeof res3.data === "object" ? res3.data : JSON.parse(res3.data || "{}");
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
      const res4 = await httpGet(apiUrl, {
        headers: {
          "User-Agent": ua,
          Referer: fullPlayerUrl,
          Cookie: getCookieString(cookieJar),
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      const data = typeof res4.data === "object" ? res4.data : JSON.parse(res4.data || "{}");
      if (data && data.url) {
        return {
          streamUrl: data.url,
          subtitleUrl,
        };
      }
    }
  }

  throw new Error(`Failed to resolve NHPlayer stream from embed (${embedUrl})`);
}

/**
 * Search anime catalog using official JSON search endpoint.
 */
async function SearchAnime(query, page = 1) {
  try {
    const q = String(query || "").trim();
    if (!q) {
      return { currentPage: 1, hasNextPage: false, totalPages: 0, results: [] };
    }

    const searchUrl = `${baseUrl}/api/search?q=${encodeURIComponent(q)}`;
    const res = await httpGet(searchUrl, {
      headers: {
        Accept: "application/json",
        Referer: `${baseUrl}/search?q=${encodeURIComponent(q)}`,
      },
    });

    const data = typeof res.data === "object" ? res.data : JSON.parse(res.data || "{}");
    const videos = data.videos || [];

    const results = [];
    const seen = new Set();

    for (const v of videos) {
      const seriesSlug = v.titleSlug || v.slug;
      if (seen.has(seriesSlug)) continue;
      seen.add(seriesSlug);

      results.push({
        id: seriesSlug,
        title: v.title || seriesSlug,
        image: normalizeImageUrl(v.cover || v.thumb || v.featureImage),
        cover: normalizeImageUrl(v.backdrop || v.cover),
        rating: v.rating ? String(v.rating) : null,
        releaseDate: v.year ? String(v.year) : null,
        type: "Anime",
      });
    }

    return {
      currentPage: 1,
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    console.error("1hanime SearchAnime error:", err.message);
    return { currentPage: 1, hasNextPage: false, totalPages: 0, results: [] };
  }
}

/**
 * Fetch detailed anime metadata and episode catalog.
 */
async function AnimeInfo(animeId) {
  const seriesSlug = cleanSlug(animeId).replace(/-episode-\d+$/, "");
  const info = {
    id: seriesSlug || cleanSlug(animeId),
    title: seriesSlug,
    image: "",
    cover: "",
    description: "",
    status: "Completed",
    type: "Anime",
    episodes: [],
  };

  try {
    let html = "";
    let rsc = "";
    try {
      const seriesUrl = `${baseUrl}/series/${seriesSlug}`;
      const res = await httpGet(seriesUrl, {
        headers: { Referer: `${baseUrl}/` },
      });
      html = typeof res.data === "string" ? res.data : "";
      rsc = extractRscPayload(html);
    } catch (_) {}

    if (!rsc) {
      const pageUrl = `${baseUrl}/${cleanSlug(animeId)}`;
      const res = await httpGet(pageUrl, {
        headers: { Referer: `${baseUrl}/` },
      });
      html = typeof res.data === "string" ? res.data : "";
      rsc = extractRscPayload(html);
    }

    // Title extraction
    const titleMatch =
      rsc.match(new RegExp(`"titleSlug":"${seriesSlug}"[^{}]*"title":"([^"]+)"`)) ||
      rsc.match(new RegExp(`"title":"([^"]+)"[^{}]*"titleSlug":"${seriesSlug}"`)) ||
      (html ? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) : null) ||
      (html ? html.match(/<title>([\s\S]*?)<\/title>/i) : null) ||
      rsc.match(/"name":"([^"]+)"/) ||
      rsc.match(/"title":"([^"]+)"/);

    if (titleMatch) {
      const rawTitle = titleMatch[1].replace(/<[^>]+>/g, "").split(/[—\-|]/)[0].trim();
      if (rawTitle && rawTitle !== "Next.MetadataOutlet" && rawTitle !== "Page not found") {
        info.title = rawTitle;
      }
    }

    // Cover extraction
    const coverMatch = rsc.match(/"cover":"([^"]+)"/) || rsc.match(/"backdrop":"([^"]+)"/);
    const cover = coverMatch ? normalizeImageUrl(coverMatch[1]) : "";
    info.cover = cover;
    info.image = cover;

    // Synopsis extraction
    const descMatch = rsc.match(/"description":"([^"]+)"/);
    if (descMatch) {
      info.description = descMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    // Episodes extraction strictly filtered by seriesSlug
    const episodes = extractEpisodesFromRsc(rsc, seriesSlug, cover);

    // Fallback: single episode if no cards matched
    if (episodes.length === 0) {
      const epNumMatch = rsc.match(/"ep":([0-9]+)/);
      const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;
      episodes.push({
        id: cleanSlug(animeId),
        number: epNum,
        title: `Episode ${epNum}`,
        image: cover,
        thumbnail: cover,
      });
    }

    info.episodes = episodes;
    return info;
  } catch (err) {
    console.error("1hanime AnimeInfo error:", err.message);
    return info;
  }
}

/**
 * Fetch episodes pagination wrapper.
 */
async function fetchEpisode(animeId, page = 1) {
  try {
    const info = await AnimeInfo(animeId);
    return {
      TotalPages: 1,
      total: info.episodes.length,
      episodes: info.episodes,
    };
  } catch (err) {
    console.error("1hanime fetchEpisode error:", err.message);
    return { TotalPages: 1, total: 0, episodes: [] };
  }
}

/**
 * Fetch video sources and subtitles for a specific episode.
 */
async function fetchEpisodeSources(episodeId, category = null) {
  try {
    installStreamProxyInterceptor();
    const epSlug = cleanSlug(episodeId);
    let episodeUrl = `${baseUrl}/${epSlug}`;

    let res = await httpGet(episodeUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    let html = typeof res.data === "string" ? res.data : "";
    let rsc = extractRscPayload(html);

    let embedUrl = findEmbedUrl(html, rsc, epSlug);

    if (!embedUrl) {
      // Try series page
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
          global.setDynamicReferer("animeidhentai.com", "https://nhplayer.com/");
          global.setDynamicReferer("nhplayer.com", `${baseUrl}/`);
        }
        if (typeof global.setFallbackReferer === "function") {
          global.setFallbackReferer("https://nhplayer.com/");
        }
      }
    } catch (_) {}

    const sources = [
      {
        name: "NHPlayer (1080p)",
        quality: "1080p",
        url: resolved.streamUrl,
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
    console.error("1hanime fetchEpisodeSources error:", err.message);
    return { sources: [], subtitles: [] };
  }
}

/**
 * Fetch recent / browse episodes.
 */
async function fetchRecentEpisodes(page = 1) {
  const pageNum = normalizePage(page);
  try {
    const url =
      pageNum === 1 ? `${baseUrl}/browse` : `${baseUrl}/browse?page=${pageNum}`;
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
        const image = thumb ? normalizeImageUrl(thumb) : "";

        results.push({
          id: slug,
          title,
          episodeNumber: epNum,
          image,
          type: "Anime",
        });
      }
    }

    return {
      currentPage: pageNum,
      hasNextPage: results.length > 0,
      totalPages: 100,
      results,
    };
  } catch (err) {
    console.error("1hanime fetchRecentEpisodes error:", err.message);
    return { currentPage: 1, hasNextPage: false, totalPages: 0, results: [] };
  }
}

/**
 * Fetch trending episodes.
 */
async function fetchTrending(page = 1) {
  const pageNum = normalizePage(page);
  try {
    const url =
      pageNum === 1
        ? `${baseUrl}/trending`
        : `${baseUrl}/trending?page=${pageNum}`;
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
        const image = thumb ? normalizeImageUrl(thumb) : "";

        results.push({
          id: slug,
          title,
          episodeNumber: epNum,
          image,
          type: "Anime",
        });
      }
    }

    return {
      currentPage: pageNum,
      hasNextPage: results.length > 0,
      totalPages: 100,
      results,
    };
  } catch (err) {
    console.error("1hanime fetchTrending error:", err.message);
    return { currentPage: 1, hasNextPage: false, totalPages: 0, results: [] };
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
  name: "1hanime",
  version: "1.0.2",
  baseUrl,
  aliasUrl,
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
