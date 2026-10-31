/**
 * StrawVerse Extension - Hentai.tv Scraper & Stream Resolver
 * Features:
 *  - Full Next.js App Router streaming RSC hydration parser for catalog & metadata
 *  - Reverse-engineered NHPlayer challenge solver (DOM token extraction + client-side PoW)
 *  - Direct 1080p MP4 stream resolution with byte-range seeking
 *  - Automated English subtitle (.srt) extraction
 *  - Strict Referer & Origin declarative header rules for Cloudflare R2 CDN bypass
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
        if (
          urlStr.includes("r2.1hanime.com") ||
          urlStr.includes("1hanime.com") ||
          urlStr.includes("animeidhentai.com") ||
          urlStr.includes("htstreaming.com") ||
          urlStr.includes("nhplayer.com") ||
          urlStr.includes("hentai.tv")
        ) {
          // Bypass Android Capacitor bridge to prevent 10s bridge timeout and memory buffering
          config.strawverseDirectHttp = true;

          // Enforce TLS 1.3 to pass Cloudflare bot detection
          if (customTlsAgent) {
            config.httpsAgent = customTlsAgent;
          }

          // Ensure proper stream headers for Cloudflare R2 CDN validation
          if (urlStr.includes("r2.1hanime.com") || urlStr.includes("1hanime.com")) {
            try {
              const u = new URL(config.url);
              config.headers = {
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
    match: [
      "hentai.tv",
      "nhplayer",
      "nhplayer.com",
      "1hanime",
      "1hanime.com",
      "r2.1hanime.com",
      "htstreaming",
      "cdn.htstreaming.com",
    ],
    headers: {
      Referer: "https://nhplayer.com/",
      Origin: "https://nhplayer.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: ["1hanime", "1hanime.com", "r2.1hanime.com", "htstreaming", "cdn.htstreaming.com"],
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
  "r2.1hanime.com",
  "htstreaming.com",
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

// HTTP helper compatible with StrawVerse global.axios and native fetch
async function httpGet(url, options = {}) {
  if (global.axios) {
    try {
      return await global.axios.get(url, options);
    } catch (_) {
      // Fall through to native fetch
    }
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

function normalizePage(arg) {
  if (typeof arg === "number") return Math.max(1, arg);
  if (typeof arg === "string") return Math.max(1, parseInt(arg, 10) || 1);
  if (arg && typeof arg === "object") {
    if (typeof arg.page === "number") return Math.max(1, arg.page);
    if (typeof arg.page === "string") return Math.max(1, parseInt(arg.page, 10) || 1);
  }
  return 1;
}

function cleanSlug(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .replace(/^https?:\/\/[^\/]+\/hentai\//i, "")
    .replace(/^https?:\/\/[^\/]+\/series\//i, "")
    .replace(/^https?:\/\/[^\/]+\//i, "")
    .replace(/^\/?hentai\//i, "")
    .replace(/^\/?series\//i, "")
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
    const url = `${baseUrl}/search?q=${encodeURIComponent(q)}`;
    const res = await httpGet(url, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    const results = [];
    const seen = new Set();

    const matches = rsc.matchAll(
      /\{[^{}]*"slug":"([^"]+)"[^{}]*"title":"([^"]+)"(?:[^{}]*"thumb":"([^"]+)")?[^{}]*\}/g
    );

    for (const m of matches) {
      const slug = m[1];
      const title = m[2];
      const thumb = m[3] || null;

      if (!seen.has(slug) && !slug.includes("search") && title !== "Page not found") {
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
  const animeInfo = {
    id: slug,
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
    const url = `${baseUrl}/hentai/${slug}`;
    const res = await httpGet(url, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    const titleMatch = rsc.match(/"title":"([^"]+)"/);
    if (titleMatch && titleMatch[1] !== "Page not found") {
      animeInfo.title = titleMatch[1];
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

    const thumbMatch = rsc.match(/"thumb":"([^"]+)"/);
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

    // Check if part of a series with multiple episodes
    const seriesSlugMatch = rsc.match(/"titleSlug":"([^"]+)"/);
    const episodes = [];

    if (seriesSlugMatch && seriesSlugMatch[1] && seriesSlugMatch[1] !== slug) {
      const seriesSlug = seriesSlugMatch[1];
      try {
        const sRes = await httpGet(`${baseUrl}/series/${seriesSlug}`, {
          headers: { Referer: `${baseUrl}/` },
        });
        const sHtml = typeof sRes.data === "string" ? sRes.data : "";
        const sRsc = extractRscPayload(sHtml);

        const epMatches = sRsc.matchAll(
          /\{[^{}]*"slug":"([^"]+)"[^{}]*"ep":([0-9]+)(?:[^{}]*"thumb":"([^"]+)")?[^{}]*\}/g
        );

        const seenEps = new Set();
        for (const em of epMatches) {
          const epSlug = em[1];
          const epNum = parseInt(em[2], 10);
          const epThumb = em[3] || null;

          if (!seenEps.has(epSlug)) {
            seenEps.add(epSlug);
            episodes.push({
              id: epSlug,
              number: epNum,
              title: `Episode ${epNum}`,
              thumbnail: epThumb
                ? (epThumb.startsWith("http") ? epThumb : `${baseUrl}${epThumb}`)
                : animeInfo.image,
            });
          }
        }
      } catch (_) {}
    }

    // Fallback: single episode
    if (episodes.length === 0) {
      const epNumMatch = rsc.match(/"ep":([0-9]+)/);
      const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;
      episodes.push({
        id: slug,
        number: epNum,
        title: `Episode ${epNum}`,
        thumbnail: animeInfo.image,
      });
    }

    episodes.sort((a, b) => a.number - b.number);
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
 * Solve NHPlayer anti-bot challenge to retrieve direct MP4 stream URL.
 */
async function solveNhPlayer(embedUrl) {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
  const headers = { "User-Agent": ua, Referer: `${baseUrl}/` };

  // 1. Fetch embed page
  const res1 = await httpGet(embedUrl, { headers });
  const html1 = typeof res1.data === "string" ? res1.data : "";

  const playerPathMatch =
    html1.match(/data-id="(\/player\.php\?[^"]+)"/) ||
    html1.match(/src="(\/player\.php\?[^"]+)"/);

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

  const playerUrl = `https://nhplayer.com${playerPath}`;

  // 2. Fetch player.php
  const pHeaders = { ...headers, Referer: embedUrl };
  const res2 = await httpGet(playerUrl, { headers: pHeaders });
  const pHtml = typeof res2.data === "string" ? res2.data : "";

  const vid = pHtml.match(/vid:"([^"]+)"/)[1];
  const ct = pHtml.match(/ct:"([^"]+)"/)[1];
  const pid = pHtml.match(/pid:"([^"]+)"/)[1];
  const st = pHtml.match(/st:"([^"]+)"/)[1];

  const coreMatch = pHtml.match(/src="(player-core-v2\.php\?[^"]+)"/)[1];
  const coreUrl = `https://nhplayer.com/${coreMatch}`;

  // 3. Fetch player-core-v2.php
  const cHeaders = { ...pHeaders, Referer: playerUrl };
  const res3 = await httpGet(coreUrl, { headers: cHeaders });
  const coreJs = typeof res3.data === "string" ? res3.data : "";

  const sc = coreJs.match(/var _[a-zA-Z0-9]+='([0-9a-f]+\.[0-9a-f]+)';/)[1];
  const rid = coreJs.match(/var _[a-zA-Z0-9]+='([0-9a-f]{16})';/)[1];

  const elemIds = [...coreJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  const [e1Id, e2Id, e3Id, e4Id, e5Id] = elemIds;

  // Extract randomized DOM tokens
  const p1Match =
    pHtml.match(new RegExp(`id="${e1Id}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
    pHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${e1Id}"`));
  const p1 = p1Match[1];

  const p2Match =
    pHtml.match(new RegExp(`id="${e2Id}"[^>]*value="([^"]+)"`)) ||
    pHtml.match(new RegExp(`value="([^"]+)"[^>]*id="${e2Id}"`));
  const p2 = p2Match[1];

  const p3Match =
    pHtml.match(new RegExp(`id="${e3Id}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
    pHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${e3Id}"`));
  const p3 = p3Match[1];

  const p4Match = pHtml.match(new RegExp(`id="${e4Id}"[^>]*><p>([^<]+)</p>`));
  const p4 = p4Match[1].trim();

  const e5Match =
    pHtml.match(new RegExp(`id="${e5Id}"[^>]*data-[a-f0-9]+="([^"]+)"`)) ||
    pHtml.match(new RegExp(`data-[a-f0-9]+="([^"]+)"[^>]*id="${e5Id}"`));
  const ts = e5Match[1];

  // 4. Solve client-side Proof-of-Work
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

  // Minimum required delay on page for anti-bot heuristics
  await new Promise((r) => setTimeout(r, 1000));

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
    vid,
    c: ct,
    p1,
    p2,
    p3,
    p4,
    t: ts,
    sc,
    rid,
    fp: fpB64,
    df: "",
    pow,
    pid,
    st,
  });

  const apiUrl = `https://nhplayer.com/get-video-url-v2.php?${params.toString()}`;
  const res4 = await httpGet(apiUrl, {
    headers: {
      "User-Agent": ua,
      Referer: playerUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const data = typeof res4.data === "object" ? res4.data : JSON.parse(res4.data);

  return {
    streamUrl: data.url,
    subtitleUrl,
  };
}

/**
 * Fetch video sources and subtitles for a specific episode.
 */
async function fetchEpisodeSources(episodeId, category = null) {
  try {
    installStreamProxyInterceptor();
    const epSlug = cleanSlug(episodeId);
    const episodeUrl = `${baseUrl}/hentai/${epSlug}`;

    const res = await httpGet(episodeUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    const embedMatch = rsc.match(/https:\/\/nhplayer\.com\/v\/[a-zA-Z0-9]+\/?/);
    if (!embedMatch) {
      console.warn("No NHPlayer embed found for episode:", epSlug);
      return { sources: [], subtitles: [] };
    }

    const embedUrl = embedMatch[0];
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
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

    return {
      currentPage: pageNum,
      hasNextPage: results.length >= 20,
      totalPages: 100,
      results,
    };
  } catch (err) {
    console.error("HentaiTv fetchRecentEpisodes error:", err.message);
    return { currentPage: pageNum, hasNextPage: false, totalPages: 0, results: [] };
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
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    console.error("HentaiTv fetchTrending error:", err.message);
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
    lower.includes("nhplayer.com") ||
    lower.includes("hentai.tv")
  ) {
    return {
      Referer: "https://nhplayer.com/",
      Origin: "https://nhplayer.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    };
  }
  return null;
}

module.exports = {
  name: "hentaitv",
  version: "1.0.1",
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
