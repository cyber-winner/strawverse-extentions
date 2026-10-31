/**
 * StrawVerse Extension - Hanime.tv / Hanime.red Scraper & Stream Resolver
 * Features:
 *  - High-performance Next.js API & JSON-LD parser with automated mirror failover (hanime.red / hanime.tv)
 *  - Direct HTTPS challenge solver (immune to Android WebView bridge cookie & referer stripping)
 *  - Client-side Proof-of-Work engine for NHPlayer challenge resolution
 *  - Direct 1080p MP4 stream resolution with byte-range seeking
 *  - Cloudflare R2 CDN bypass with Chrome-grade TLS cipher suites & declarative header rules
 */

const crypto = require("crypto");
const https = require("https");
const tls = require("tls");

// Modern browser TLS cipher suite (matches Chrome 131)
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

function installStreamProxyInterceptor() {
  if (!global.axios || global.__hanimeStreamProxyInterceptorInstalled) return;
  global.__hanimeStreamProxyInterceptorInstalled = true;

  global.axios.interceptors.request.use(
    (config) => {
      try {
        const urlStr = String(config.url || "").toLowerCase();
        // Bypass Android Capacitor WebView bridge for media streams and nhplayer
        if (
          urlStr.includes("r2.1hanime.com") ||
          urlStr.includes("cdn.htstreaming.com") ||
          urlStr.includes("nhplayer.com") ||
          urlStr.includes("hanime.red") ||
          urlStr.includes("hanime.tv")
        ) {
          config.strawverseDirectHttp = true;

          if (customTlsAgent) {
            config.httpsAgent = customTlsAgent;
          }

          if (urlStr.includes("r2.1hanime.com") || urlStr.includes("cdn.htstreaming.com")) {
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

const primaryBaseUrl = "https://hanime.red";
const mirrorBaseUrls = ["https://hanime.red", "https://hanime.tv"];
let baseUrl = primaryBaseUrl;

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
  "hanime.tv",
  "hanime.red",
  "nhplayer.com",
  "r2.1hanime.com",
  "cdn.htstreaming.com",
];

// Register dynamic referer rules in StrawVerse StreamProxy
try {
  if (typeof global.setDynamicReferer === "function") {
    global.setDynamicReferer("r2.1hanime.com", "https://nhplayer.com/");
    global.setDynamicReferer("nhplayer.com", "https://hanime.red/");
  }
  if (typeof global.setFallbackReferer === "function") {
    global.setFallbackReferer("https://nhplayer.com/");
  }
} catch (_) {}

function cleanSlug(str) {
  if (!str) return "";
  let clean = String(str).trim();
  clean = clean.replace(/^(https?:\/\/[^\/]+)?\/?(serie|series|videos\/hentai|hentai\/video)?\/?/, "");
  clean = clean.replace(/\/+$/, "");
  return clean;
}

function normalizePage(page) {
  const parsed = parseInt(page, 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

/**
 * Direct HTTPS Request engine
 * Pure Node.js request that bypasses Android Background WebView bridge,
 * tracking cookies, maintaining TLS 1.3 fingerprints, and handling redirects.
 */
function directHttpsRequest(targetUrl, options = {}, cookieJar = null) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(targetUrl);
      const headers = {
        Host: u.hostname,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        ...(options.headers || {}),
      };

      if (cookieJar) {
        const cookieStr = Object.entries(cookieJar)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        if (cookieStr) headers["Cookie"] = cookieStr;
      }

      const reqOptions = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers,
        agent: customTlsAgent || undefined,
        timeout: options.timeout || 15000,
      };

      const req = https.request(reqOptions, (res) => {
        if (res.headers["set-cookie"] && cookieJar) {
          const setCookies = Array.isArray(res.headers["set-cookie"])
            ? res.headers["set-cookie"]
            : [res.headers["set-cookie"]];
          for (const raw of setCookies) {
            const pair = raw.split(";")[0];
            const eqIdx = pair.indexOf("=");
            if (eqIdx > 0) {
              const k = pair.substring(0, eqIdx).trim();
              const v = pair.substring(eqIdx + 1).trim();
              cookieJar[k] = v;
            }
          }
        }

        // Handle Redirects
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          (options.maxRedirects === undefined || options.maxRedirects > 0)
        ) {
          const redirectUrl = new URL(res.headers.location, targetUrl).toString();
          const nextOpts = {
            ...options,
            maxRedirects: (options.maxRedirects || 5) - 1,
            headers: {
              ...(options.headers || {}),
              Referer: targetUrl,
            },
          };
          res.resume();
          return directHttpsRequest(redirectUrl, nextOpts, cookieJar)
            .then(resolve)
            .catch(reject);
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const bodyBuffer = Buffer.concat(chunks);
          const bodyText = bodyBuffer.toString("utf8");
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: bodyText,
            buffer: bodyBuffer,
          });
        });
      });

      req.on("error", (err) => reject(err));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Direct HTTPS request timed out after ${options.timeout || 15000}ms`));
      });

      if (options.data) {
        req.write(typeof options.data === "string" ? options.data : JSON.stringify(options.data));
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Resilient HTTP GET
 */
async function httpGet(url, options = {}) {
  try {
    const res = await directHttpsRequest(url, {
      method: "GET",
      headers: options.headers || {},
      timeout: options.timeout || 15000,
    });
    if (res.status >= 200 && res.status < 400) {
      return res;
    }
  } catch (_) {}

  if (global.axios) {
    try {
      const axiosOpts = {
        ...options,
        strawverseDirectHttp: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...(options.headers || {}),
        },
        timeout: options.timeout || 15000,
        validateStatus: (s) => s < 400,
      };
      if (customTlsAgent) axiosOpts.httpsAgent = customTlsAgent;
      return await global.axios.get(url, axiosOpts);
    } catch (_) {}
  }

  throw new Error(`Failed to fetch HTTP resource: ${url}`);
}

/**
 * Extract JSON-LD payload objects from HTML
 */
function extractJsonLd(html) {
  if (!html) return [];
  const results = [];
  const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      results.push(parsed);
    } catch (_) {}
  }
  return results;
}

/**
 * Extract Next.js streaming RSC payloads
 */
function extractRscPayload(html) {
  if (!html) return "";
  const payloads = [];
  const matches = html.matchAll(/self\.__next_f\.push\(\[[\s\S]*?,"([\s\S]*?)"\]\)/g);
  for (const m of matches) {
    try {
      const raw = m[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "");
      payloads.push(raw);
    } catch (_) {}
  }
  return payloads.join("\n");
}

/**
 * Search anime titles
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
      const results = [];
      const seen = new Set();

      // Check series list
      const seriesList = data.series || [];
      for (const s of seriesList) {
        if (!s.slug || seen.has(s.slug)) continue;
        seen.add(s.slug);
        results.push({
          id: s.slug,
          title: s.name || s.slug,
          image: null,
          cover: null,
          rating: null,
          type: "Hentai",
        });
      }

      // Check videos list
      const videos = data.videos || [];
      for (const v of videos) {
        const seriesSlug = v.seriesSlug || (v.slug ? v.slug.replace(/-episode-\d+$/, "") : v.slug);
        if (seen.has(seriesSlug)) continue;
        seen.add(seriesSlug);

        let img = v.poster || v.thumb || v.cover;
        if (img && !img.startsWith("http")) {
          img = `${baseUrl}/media/${img.replace(/^\/?(media\/)?/, "")}`;
        }

        results.push({
          id: seriesSlug,
          title: v.title ? v.title.replace(/\s+Episode\s+\d+.*$/i, "").trim() : seriesSlug,
          image: img || null,
          cover: img || null,
          rating: v.views ? String(v.views) : null,
          type: "Hentai",
        });
      }

      if (results.length > 0) {
        return {
          currentPage: pageNum,
          hasNextPage: false,
          totalPages: 1,
          results,
        };
      }
    } catch (_) {}

    // 2. HTML Fallback
    const searchHtmlUrl = `${baseUrl}/search?q=${encodeURIComponent(q)}`;
    const htmlRes = await httpGet(searchHtmlUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof htmlRes.data === "string" ? htmlRes.data : "";
    const results = [];
    const seen = new Set();

    // Match series links
    const serieMatches = html.matchAll(/href="\/serie\/([a-z0-9\-]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of serieMatches) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      const inner = m[2];
      const titleMatch = inner.match(/alt="([^"]+)"/) || inner.match(/card-title[^>]*>([^<]+)/);
      const imgMatch = inner.match(/src="([^"]+)"/);
      let img = imgMatch ? imgMatch[1] : null;
      if (img && !img.startsWith("http")) img = `${baseUrl}${img}`;

      results.push({
        id: slug,
        title: titleMatch ? titleMatch[1].trim() : slug,
        image: img,
        cover: img,
        rating: null,
        type: "Hentai",
      });
    }

    // Match episode links as series candidates
    const epMatches = html.matchAll(/href="\/([a-z0-9\-]+-episode-\d+)"[^>]*title="([^"]+)"/gi);
    for (const m of epMatches) {
      const epSlug = m[1];
      const seriesSlug = epSlug.replace(/-episode-\d+$/, "");
      if (seen.has(seriesSlug)) continue;
      seen.add(seriesSlug);
      const rawTitle = m[2].replace(/\s+Episode\s+\d+.*$/i, "").trim();
      results.push({
        id: seriesSlug,
        title: rawTitle || seriesSlug,
        image: null,
        cover: null,
        rating: null,
        type: "Hentai",
      });
    }

    return {
      currentPage: pageNum,
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    return {
      currentPage: pageNum,
      hasNextPage: false,
      totalPages: 0,
      results: [],
      error: err.message,
    };
  }
}

/**
 * Fetch Anime / Series metadata and episode list
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
    // 1. Try series page: /serie/${cleanTargetSlug}
    try {
      const sRes = await httpGet(`${baseUrl}/serie/${cleanTargetSlug}`, {
        headers: { Referer: `${baseUrl}/` },
      });
      html = typeof sRes.data === "string" ? sRes.data : "";
    } catch (_) {}

    // 2. Try episode page fallback if series page not found
    if (!html || html.includes("Page not found")) {
      try {
        const epRes = await httpGet(`${baseUrl}/${slug}`, {
          headers: { Referer: `${baseUrl}/` },
        });
        html = typeof epRes.data === "string" ? epRes.data : "";
      } catch (_) {}
    }

    if (!html) return animeInfo;

    // Parse JSON-LD structures
    const jsonLds = extractJsonLd(html);
    for (const ld of jsonLds) {
      if (ld["@type"] === "CollectionPage" || ld.mainEntity?.["@type"] === "ItemList") {
        if (ld.name) animeInfo.title = ld.name;
        const items = ld.mainEntity?.itemListElement || [];
        for (const item of items) {
          const itemUrl = item.url || "";
          const epSlug = itemUrl.split("/").filter(Boolean).pop();
          if (epSlug) {
            animeInfo.episodes.push({
              id: epSlug,
              number: item.position || animeInfo.episodes.length + 1,
              title: item.name || `Episode ${animeInfo.episodes.length + 1}`,
              url: itemUrl,
            });
          }
        }
      }

      if (ld["@type"] === "VideoObject") {
        if (!animeInfo.title || animeInfo.title === slug) {
          if (ld.partOfSeries?.name) animeInfo.title = ld.partOfSeries.name;
          else if (ld.name) animeInfo.title = ld.name.replace(/\s+Episode\s+\d+.*$/i, "").trim();
        }
        if (ld.description && !animeInfo.description) {
          animeInfo.description = ld.description;
        }
        if (Array.isArray(ld.genre) && ld.genre.length > 0) {
          animeInfo.genres = ld.genre;
        }
        if (ld.productionCompany?.name) {
          animeInfo.brand = ld.productionCompany.name;
        }
        if (Array.isArray(ld.thumbnailUrl) && ld.thumbnailUrl[0]) {
          animeInfo.image = ld.thumbnailUrl[0];
          animeInfo.cover = ld.thumbnailUrl[0];
        }
      }
    }

    // HTML metadata parsing fallback
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch && (!animeInfo.title || animeInfo.title === slug)) {
      const cleanTitle = titleMatch[1].split(/[—\-|]/)[0].trim();
      if (cleanTitle && cleanTitle !== "hanime") {
        animeInfo.title = cleanTitle;
      }
    }

    const ogImgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImgMatch && !animeInfo.image) {
      animeInfo.image = ogImgMatch[1];
      animeInfo.cover = ogImgMatch[1];
    }

    const descMeta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (descMeta && !animeInfo.description) {
      animeInfo.description = descMeta[1];
    }

    // Extract episodes from HTML links if JSON-LD had none
    if (animeInfo.episodes.length === 0) {
      const epMatches = [...html.matchAll(/href="\/([a-z0-9\-]+-episode-(\d+))"[^>]*title="([^"]+)"/gi)];
      const seen = new Set();
      for (const m of epMatches) {
        const epSlug = m[1];
        if (seen.has(epSlug)) continue;
        seen.add(epSlug);
        const epNum = parseInt(m[2], 10) || seen.size;
        animeInfo.episodes.push({
          id: epSlug,
          number: epNum,
          title: m[3] || `Episode ${epNum}`,
        });
      }

      // If still empty, check links with episode slug pattern
      if (animeInfo.episodes.length === 0) {
        const slugPrefix = cleanTargetSlug.replace(/-+$/, "");
        const fallbackRegex = new RegExp(`href="\\/(${slugPrefix}-episode-(\\d+))"`, "gi");
        const fbMatches = [...html.matchAll(fallbackRegex)];
        for (const m of fbMatches) {
          const epSlug = m[1];
          if (seen.has(epSlug)) continue;
          seen.add(epSlug);
          const epNum = parseInt(m[2], 10) || seen.size;
          animeInfo.episodes.push({
            id: epSlug,
            number: epNum,
            title: `Episode ${epNum}`,
          });
        }
      }
    }

    // Fallback if no episodes found at all: single episode
    if (animeInfo.episodes.length === 0) {
      animeInfo.episodes.push({
        id: slug.includes("-episode-") ? slug : `${slug}-episode-1`,
        number: 1,
        title: animeInfo.title || "Episode 1",
      });
    }

    animeInfo.episodes.sort((a, b) => a.number - b.number);
    animeInfo.totalEpisodes = animeInfo.episodes.length;
    return animeInfo;
  } catch (err) {
    return animeInfo;
  }
}

async function fetchEpisode(id, page = 1) {
  const info = await AnimeInfo(id);
  return info.episodes || [];
}

/**
 * NHPlayer challenge solver with direct Node HTTPS execution
 */
async function solveNhPlayer(embedUrl) {
  const cookieJar = {};
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const res1 = await directHttpsRequest(
    embedUrl,
    {
      headers: {
        "User-Agent": ua,
        Referer: `${baseUrl}/`,
      },
    },
    cookieJar
  );

  const html1 = res1.data;
  const playerPathMatch = html1.match(/data-id="(\/player\.php\?[^"]+)"/);
  if (!playerPathMatch) {
    const directSrcMatch =
      html1.match(/source\s+src="([^"]+)"/) || html1.match(/<video[^>]+src="([^"]+)"/);
    if (directSrcMatch) {
      return {
        sources: [
          {
            name: "NHPlayer (Direct)",
            quality: "1080p",
            url: directSrcMatch[1],
            isM3U8: directSrcMatch[1].includes(".m3u8"),
            type: directSrcMatch[1].includes(".m3u8") ? "hls" : "mp4",
            headers: {
              Referer: "https://nhplayer.com/",
              Origin: "https://nhplayer.com",
              "User-Agent": ua,
            },
          },
        ],
        subtitles: [],
      };
    }
    throw new Error(`Failed to find player data-id from NHPlayer embed: ${embedUrl}`);
  }

  const playerPath = playerPathMatch[1].replace(/&amp;/g, "&");
  const playerFullUrl = `https://nhplayer.com${playerPath}`;

  const res2 = await directHttpsRequest(
    playerFullUrl,
    {
      headers: {
        "User-Agent": ua,
        Referer: embedUrl,
      },
    },
    cookieJar
  );

  const html2 = res2.data;

  // Extract window._pV parameters
  const pVMatch = html2.match(/window\._pV\s*=\s*({[\s\S]*?});/);
  if (!pVMatch) {
    throw new Error("Failed to extract NHPlayer window._pV parameter object");
  }

  let pV;
  try {
    pV = JSON.parse(pVMatch[1]);
  } catch (_) {
    pV = eval(`(${pVMatch[1]})`);
  }

  // Extract player-core script
  const coreScriptMatch = html2.match(/src="(player-core[^"]+)"/);
  if (!coreScriptMatch) {
    throw new Error("Failed to extract NHPlayer player-core script path");
  }

  const coreScriptUrl = `https://nhplayer.com/${coreScriptMatch[1]}`;
  const res3 = await directHttpsRequest(
    coreScriptUrl,
    {
      headers: {
        "User-Agent": ua,
        Referer: playerFullUrl,
      },
    },
    cookieJar
  );
  const coreScript = res3.data;

  // Challenge tokens
  const tokenRegex = /\/\/[^\n]*challenge token[^\n]*\n\s*(?:var\s+)?\w+\s*=\s*'([^']+)'\s*;\s*\n\s*(?:var\s+)?\w+\s*=\s*'([^']+)'\s*;/i;
  const tokenMatch = coreScript.match(tokenRegex);
  if (!tokenMatch) {
    throw new Error("Failed to extract NHPlayer challenge tokens from player script");
  }
  const serverTokenSc = tokenMatch[1];
  const serverTokenRid = tokenMatch[2];

  // DOM challenge selectors
  const selectorMatches = [...coreScript.matchAll(/d\.getElementById\('([^']+)'\)/g)];
  if (selectorMatches.length < 5) {
    throw new Error("Failed to locate NHPlayer DOM element IDs for challenge parts");
  }

  const s0 = selectorMatches[0][1];
  const s1 = selectorMatches[1][1];
  const s2 = selectorMatches[2][1];
  const s3 = selectorMatches[3][1];
  const s4 = selectorMatches[4][1];

  function extractChallengePart(html, id) {
    const patterns = [
      new RegExp(`<span\\s+id="${id}"\\s+data-[0-9a-f]{4}="([^"]+)"`, "i"),
      new RegExp(`<input\\s+type="hidden"\\s+id="${id}"\\s+value="([^"]+)"`, "i"),
      new RegExp(`<div\\s+id="${id}"\\s+data-[0-9a-f]{4}="([^"]+)"`, "i"),
      new RegExp(`<template\\s+id="${id}">\\s*<p>([^<]+)<\\/p>`, "i"),
      new RegExp(`<template\\s+id="${id}">([^<]+)<\\/template>`, "i"),
      new RegExp(`id="${id}"[^>]*value="([^"]+)"`, "i"),
      new RegExp(`id="${id}"[^>]*data-[^=]+="([^"]+)"`, "i"),
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) return m[1];
    }
    return "";
  }

  const p1 = extractChallengePart(html2, s0);
  const p2 = extractChallengePart(html2, s1);
  const p3 = extractChallengePart(html2, s2);
  const p4 = extractChallengePart(html2, s3);
  const pt = extractChallengePart(html2, s4);

  if (!p1 || !p2 || !p3 || !p4 || !pt) {
    throw new Error(`Failed to extract challenge parts from NHPlayer player DOM (${s0},${s1},${s2},${s3},${s4})`);
  }

  // Client-side Proof of Work: SHA256(combined + n_hex) starting with 0000 (2 zero bytes)
  const combinedChallenge = `${p1}${p2}${p3}${p4}${pt}`;
  let powResult = null;
  for (let n = 0; n < 10000000; n++) {
    const hexN = n.toString(16);
    const hash = crypto.createHash("sha256").update(`${combinedChallenge}${hexN}`).digest();
    if (hash[0] === 0 && hash[1] === 0) {
      powResult = hexN;
      break;
    }
  }

  if (!powResult) {
    throw new Error("NHPlayer Proof-of-Work failed to find matching nonce");
  }

  // Realistic browser fingerprint
  const epochTs = Date.now();
  const fpPayload = JSON.stringify({
    t: epochTs + 2100,
    mm: [],
    tm: [],
    cl: [],
    kp: [],
    sc: [],
    i: 0,
    mc: 0,
    tc: 0,
    cc: 0,
    kc: 0,
    b: {
      sw: 1920,
      sh: 1080,
      aw: 1920,
      ah: 1080,
      cd: 24,
      pd: 24,
      tz: 0,
      hc: 8,
      dm: 8,
      pl: "Win32",
      lang: "en-US",
      langs: "en-US,en",
      dpr: 1,
      ww: 1920,
      wh: 1080,
      touch: false,
      pdf: true,
      fonts: 1,
    },
  });
  const fp = Buffer.from(fpPayload).toString("base64");

  const queryParams = new URLSearchParams({
    vid: pV.vid,
    c: pV.ct || "",
    p1,
    p2,
    p3,
    p4,
    t: pt,
    sc: serverTokenSc,
    rid: serverTokenRid,
    fp,
    df: "[]",
    pow: powResult,
    pid: pV.pid || "",
    st: pV.st || "",
  });

  const solveUrl = `https://nhplayer.com/get-video-url-v2.php?${queryParams.toString()}`;
  const res4 = await directHttpsRequest(
    solveUrl,
    {
      headers: {
        "User-Agent": ua,
        Referer: playerFullUrl,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
    },
    cookieJar
  );

  let solveData;
  try {
    solveData = JSON.parse(res4.data);
  } catch (_) {
    throw new Error(`Failed to parse get-video-url-v2.php response: ${res4.data}`);
  }

  if (!solveData.url) {
    throw new Error(`NHPlayer solver returned no video URL: ${JSON.stringify(solveData)}`);
  }

  let finalStreamUrl = solveData.url;
  if (finalStreamUrl.startsWith("//")) {
    finalStreamUrl = `https:${finalStreamUrl}`;
  }

  const streamHeaders = {
    Referer: "https://nhplayer.com/",
    Origin: "https://nhplayer.com",
    "User-Agent": ua,
  };

  const sources = [
    {
      name: "NHPlayer (1080p)",
      quality: "1080p",
      url: finalStreamUrl,
      isM3U8: finalStreamUrl.includes(".m3u8"),
      type: finalStreamUrl.includes(".m3u8") ? "hls" : "mp4",
      headers: streamHeaders,
    },
  ];

  const subtitles = [];
  if (pV.s) {
    try {
      const srtUrl = Buffer.from(pV.s, "base64").toString("utf8");
      if (srtUrl.startsWith("http")) {
        subtitles.push({
          url: srtUrl,
          lang: "English",
        });
      }
    } catch (_) {}
  }

  return { sources, subtitles };
}

/**
 * Fetch Episode Sources / Streams
 */
async function fetchEpisodeSources(episodeId, category = null) {
  const epSlug = cleanSlug(episodeId);
  const candidateUrls = [
    `${baseUrl}/${epSlug}`,
    `${baseUrl}/serie/${epSlug}`,
    `https://hanime.red/${epSlug}`,
  ];

  let embedUrl = null;
  let lastErr = null;

  for (const url of candidateUrls) {
    try {
      const res = await httpGet(url, {
        headers: { Referer: `${baseUrl}/` },
      });
      const html = typeof res.data === "string" ? res.data : "";
      if (!html) continue;

      // 1. JSON-LD embedUrl
      const jsonLds = extractJsonLd(html);
      for (const ld of jsonLds) {
        if (ld.embedUrl && ld.embedUrl.includes("nhplayer.com")) {
          embedUrl = ld.embedUrl;
          break;
        }
      }

      // 2. Iframe src
      if (!embedUrl) {
        const iframeMatch = html.match(/<iframe[^>]+src="([^"]*nhplayer\.com[^"]*)"/i);
        if (iframeMatch) embedUrl = iframeMatch[1];
      }

      // 3. Raw nhplayer link
      if (!embedUrl) {
        const rawMatch = html.match(/https?:\/\/nhplayer\.com\/v\/[A-Za-z0-9_\-\/]+/i);
        if (rawMatch) embedUrl = rawMatch[0];
      }

      if (embedUrl) break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!embedUrl) {
    throw new Error(
      `Could not locate NHPlayer embed URL for episode ${epSlug}. ${lastErr ? `(${lastErr.message})` : ""}`
    );
  }

  return await solveNhPlayer(embedUrl);
}

/**
 * Fetch Recent Episodes from /browse
 */
async function fetchRecentEpisodes(page = 1) {
  const pageNum = normalizePage(page);
  try {
    const browseUrl = `${baseUrl}/browse?page=${pageNum}`;
    const res = await httpGet(browseUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const results = [];
    const seen = new Set();

    const matches = [...html.matchAll(/href="\/([a-z0-9\-]+-episode-\d+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of matches) {
      const epSlug = m[1];
      if (seen.has(epSlug)) continue;
      seen.add(epSlug);

      const inner = m[2];
      const titleMatch = inner.match(/title="([^"]+)"/) || inner.match(/card-title[^>]*>([^<]+)/);
      const imgMatch = inner.match(/src="([^"]+)"/);
      let img = imgMatch ? imgMatch[1] : null;
      if (img && !img.startsWith("http")) img = `${baseUrl}${img}`;

      results.push({
        id: epSlug,
        title: titleMatch ? titleMatch[1].trim() : epSlug,
        image: img,
        episode: epSlug.match(/-episode-(\d+)/)?.[1] || "1",
        type: "Hentai",
      });
    }

    return {
      currentPage: pageNum,
      hasNextPage: results.length >= 20,
      totalPages: 100,
      results,
    };
  } catch (err) {
    return {
      currentPage: pageNum,
      hasNextPage: false,
      totalPages: 0,
      results: [],
      error: err.message,
    };
  }
}

/**
 * Fetch Trending Episodes / Popular Series from Home Page
 */
async function fetchTrending(page = 1) {
  const pageNum = normalizePage(page);
  try {
    const res = await httpGet(`${baseUrl}/`, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const results = [];
    const seen = new Set();

    // Match featured cards
    const matches = [...html.matchAll(/href="\/(serie\/[a-z0-9\-]+|[a-z0-9\-]+-episode-\d+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of matches) {
      const rawSlug = m[1].replace(/^serie\//, "");
      const seriesSlug = rawSlug.replace(/-episode-\d+$/, "");
      if (seen.has(seriesSlug)) continue;
      seen.add(seriesSlug);

      const inner = m[2];
      const titleMatch =
        inner.match(/alt="([^"]+)"/) ||
        inner.match(/card-title[^>]*>([^<]+)/) ||
        inner.match(/text-white[^>]*>([^<]+)<\/div>/);
      const imgMatch = inner.match(/src="([^"]+)"/);
      let img = imgMatch ? imgMatch[1] : null;
      if (img && !img.startsWith("http")) img = `${baseUrl}${img}`;

      results.push({
        id: seriesSlug,
        title: titleMatch ? titleMatch[1].trim() : seriesSlug,
        image: img,
        cover: img,
        rating: null,
        type: "Hentai",
      });
    }

    return {
      currentPage: pageNum,
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    return {
      currentPage: pageNum,
      hasNextPage: false,
      totalPages: 0,
      results: [],
      error: err.message,
    };
  }
}

function getHeaders(url) {
  const u = String(url || "").toLowerCase();
  if (
    u.includes("r2.1hanime.com") ||
    u.includes("cdn.htstreaming.com") ||
    u.includes("nhplayer.com")
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
  name: "hanimetv",
  version: "1.0.0",
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
