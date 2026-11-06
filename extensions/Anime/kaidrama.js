/**
 * StrawVerse Extension - Kaidrama Scraper
 * Specializing in Asian Dramas, Kdramas, Cdramas, Jdramas & Movies
 * Based on https://kaidrama.com and StrawVerse Extension Specification.
 */

const cheerio = require("cheerio");

const baseUrl = "https://kaidrama.com";

// Declarative header rules for Kaidrama, Zumivids player, image CDNs, and video stream CDNs
const headerRules = [
  {
    match: [
      "kaidrama.com",
      "zumivids.com",
    ],
    headers: {
      Referer: "https://kaidrama.com/",
      Origin: "https://kaidrama.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
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
  {
    match: [
      "mixdrop.top",
      "mixdrop.ps",
      "mixdrop.co",
      "mxcontent.net",
    ],
    headers: {
      Referer: "https://mixdrop.top/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: [
      "vmnow.online",
      "vmpx.online",
    ],
    headers: {
      Referer: "https://vidmoly.org/",
      Origin: "https://vidmoly.org",
    },
  },
  {
    match: [
      "mxcontent.net",
    ],
    headers: {
      Referer: "https://mixdrop.top/",
    },
  },
];

const bypassDomains = [
  "kaidrama.com",
  "zumivids.com",
  "vidmoly.org",
  "vidmoly.net",
  "vidmoly.biz",
  "vidmoly.to",
  "vmnow.online",
  "vmpx.online",
  "streamtape.com",
  "tapecontent.net",
  "watchadsontape.com",
  "mixdrop.top",
  "mixdrop.ps",
  "mixdrop.co",
  "mxcontent.net",
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
      // Fall through to native fetch
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
 * Clean and normalize a slug / URL path.
 */
function cleanSlug(str) {
  if (!str || typeof str !== "string") return "";
  let clean = str.trim();
  clean = clean.replace(/^https?:\/\/[^\/]+/i, "");
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

/**
 * Extract highest-resolution image from img element attributes.
 */
function extractBestImg($img) {
  if (!$img || $img.length === 0) return null;
  const srcset = $img.attr("data-srcset") || $img.attr("srcset");
  if (srcset && typeof srcset === "string") {
    const parts = srcset.split(",").map((p) => p.trim());
    const lastPart = parts[parts.length - 1];
    const match = lastPart.match(/(https?:\/\/[^\s]+)/);
    if (match) return match[1];
  }
  const src =
    $img.attr("data-src") ||
    $img.attr("src") ||
    $img.attr("data-lazy-src");
  if (src && typeof src === "string" && !src.startsWith("data:")) {
    // Strip thumbnail resizing dimension suffixes like -200x300.jpg -> .jpg
    return src.replace(/-\d+x\d+(\.[a-zA-Z]+)$/, "$1");
  }
  return src || null;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "by",
  "from",
  "is",
  "it",
  "as",
  "be",
  "this",
  "that",
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
 * Ensures that only queried titles are displayed in results.
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
 * Resolve Vidmoly embed into direct playable HLS master .m3u8 stream.
 */
async function resolveVidmolyStream(embedUrl) {
  try {
    const res = await httpGet(embedUrl, {
      headers: {
        Referer: "https://zumivids.com/",
        Origin: "https://zumivids.com",
      },
    });
    const html = typeof res.data === "string" ? res.data : "";

    const match =
      html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
      html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);

    if (match && match[1]) {
      return {
        url: match[1],
        headers: {
          Referer: "https://vidmoly.org/",
          Origin: "https://vidmoly.org",
        },
      };
    }
  } catch (_) {}
  return null;
}

/**
 * Resolve Streamtape embed into direct playable MP4 video.
 */
async function resolveStreamtapeStream(embedUrl) {
  try {
    const res = await httpGet(embedUrl, {
      headers: {
        Referer: "https://zumivids.com/",
      },
    });
    const html = typeof res.data === "string" ? res.data : "";

    // Pattern 1: robotlink with two substrings
    const robotMatch = html.match(
      /getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\(['"]([^'"]+)['"]\)\.substring\((\d+)\)\.substring\((\d+)\)/,
    );
    if (robotMatch) {
      const prefix = robotMatch[1];
      const str = robotMatch[2];
      const sub1 = parseInt(robotMatch[3], 10);
      const sub2 = parseInt(robotMatch[4], 10);
      const fullUrl =
        (prefix.startsWith("http") ? "" : "https:") +
        prefix +
        str.substring(sub1).substring(sub2);
      return {
        url: fullUrl,
        headers: {
          Referer: "https://streamtape.com/",
        },
      };
    }

    // Pattern 2: botlink / ideoolink with single substring
    const botMatch = html.match(
      /getElementById\(['"](?:botlink|ideoolink)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\(['"]([^'"]+)['"]\)\.substring\((\d+)\)/,
    );
    if (botMatch) {
      const prefix = botMatch[1];
      const str = botMatch[2];
      const sub = parseInt(botMatch[3], 10);
      const fullUrl =
        (prefix.startsWith("http") ? "" : "https:") +
        prefix +
        str.substring(sub);
      return {
        url: fullUrl,
        headers: {
          Referer: "https://streamtape.com/",
        },
      };
    }

    // Pattern 3: direct get_video link
    const directMatch = html.match(
      /['"]((?:https?:)?\/\/streamtape\.com\/get_video[^'"]+)['"]/,
    );
    if (directMatch) {
      const u = directMatch[1].startsWith("http")
        ? directMatch[1]
        : "https:" + directMatch[1];
      return {
        url: u,
        headers: {
          Referer: "https://streamtape.com/",
        },
      };
    }
  } catch (_) {}
  return null;
}

/**
 * Resolve MixDrop embed into direct playable MP4 video.
 */
async function resolveMixdropStream(embedUrl) {
  try {
    const res = await httpGet(embedUrl, {
      headers: {
        Referer: "https://zumivids.com/",
      },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const match = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\}\((.+?)\)\)/);
    if (match) {
      const rawArgs = match[1];
      const fn = new Function(`
        function unpack(p, a, c, k, e, d) {
          while (c--) {
            if (k[c]) p = p.replace(new RegExp("\\\\b" + c.toString(a) + "\\\\b", "g"), k[c]);
          }
          return p;
        }
        return (function(p, a, c, k, e, d) {
          return unpack(p, a, c, k, e, d);
        })(${rawArgs});
      `);
      const unpacked = fn();
      const wurlMatch =
        unpacked.match(/(?:wurl|vurl)\s*=\s*["']([^"']+)["']/i) ||
        unpacked.match(/["']((?:https?:)?\/\/[^"']+\.mp4[^"']*)["']/i);
      if (wurlMatch && wurlMatch[1]) {
        let u = wurlMatch[1];
        if (u.startsWith("//")) u = "https:" + u;
        return {
          url: u,
          headers: {
            Referer: "https://mixdrop.top/",
          },
        };
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Search dramas and movies on Kaidrama.
 * @param {string} query - Title to search
 * @param {number|object} page - Page number or filter object
 */
async function SearchAnime(query, page = 1) {
  let pageNum = 1;
  if (typeof page === "number") {
    pageNum = Math.max(1, page);
  } else if (page && typeof page === "object") {
    pageNum = Math.max(1, parseInt(page.page, 10) || 1);
  }

  const searchQuery = (query || "").trim();
  if (!searchQuery) {
    return { results: [], hasNextPage: false, currentPage: pageNum, totalPages: 0 };
  }

  const results = [];
  const seenIds = new Set();
  let hasNext = false;
  let totalPages = 1;

  try {
    const queriesToSearch = [searchQuery];
    const strippedQuery = searchQuery.replace(/^(the|a|an)\s+/i, "").trim();
    if (strippedQuery && strippedQuery.toLowerCase() !== searchQuery.toLowerCase()) {
      queriesToSearch.push(strippedQuery);
    }

    for (const q of queriesToSearch) {
      const searchUrl =
        pageNum === 1
          ? `${baseUrl}/?s=${encodeURIComponent(q)}`
          : `${baseUrl}/page/${pageNum}/?s=${encodeURIComponent(q)}`;

      const res = await httpGet(searchUrl, {
        headers: { Referer: `${baseUrl}/` },
      });
      const html = typeof res.data === "string" ? res.data : "";
      if (!html) continue;

      const $ = cheerio.load(html);

      // Check pagination
      if ($("a.pagination-link[aria-label*='Next']").length > 0) {
        hasNext = true;
      }
      const countText = $(".archive-head-count").text().trim();
      const countMatch = countText.match(/(\d+)\s+titles/i);
      if (countMatch) {
        const totalItems = parseInt(countMatch[1], 10);
        totalPages = Math.max(1, Math.ceil(totalItems / 18));
      }

      $("li.card, .card").each((_, el) => {
        const title = $(el).find(".card-title, h2, h3").text().trim();
        const href = $(el).find("a.card-link").attr("href") || "";
        const cleanId = cleanSlug(href);
        if (!cleanId || seenIds.has(cleanId)) return;
        seenIds.add(cleanId);

        const img = extractBestImg($(el).find("img"));
        const badge = $(el).find(".card-badge, .badge").text().trim();
        const meta = $(el).find(".card-meta").text().trim();

        // Extract year from title e.g. "Title (2026)"
        let releaseYear = "";
        const yearMatch = title.match(/\((\d{4})\)/);
        if (yearMatch) {
          releaseYear = yearMatch[1];
        }

        const isMovie = href.includes("/movie/");

        results.push({
          id: cleanId,
          title,
          image: img,
          type: isMovie ? "Movie" : "Drama",
          subDub: "Sub",
          releaseYear,
          status: badge || "Unknown",
        });
      });
    }

    // Strict Relevance Filtering: Only display results that match what was queried
    const filteredResults = results.filter((r) =>
      isRelevantMatch(r.title, searchQuery),
    );

    // Relevance ranking: Rank exact matches and query overlaps at the top
    filteredResults.sort((a, b) => {
      const scoreA = calculateRelevance(a.title, searchQuery);
      const scoreB = calculateRelevance(b.title, searchQuery);
      return scoreB - scoreA;
    });

    return {
      results: filteredResults,
      hasNextPage: hasNext && filteredResults.length >= 18,
      currentPage: pageNum,
      totalPages: filteredResults.length === 0 ? 0 : totalPages,
    };
  } catch (err) {
    return {
      results: [],
      hasNextPage: false,
      currentPage: pageNum,
      totalPages: 0,
    };
  }
}

/**
 * Fetch detailed drama or movie metadata and episode list.
 * @param {string} id - Drama slug (e.g. "drama/northern-storm-2026", "movie/morte-cucina-2025", or episode slug)
 */
async function AnimeInfo(id) {
  let cleanId = cleanSlug(id);

  // If passed an episode ID like "northern-storm-2026-episode-1-with-english-subtitle",
  // extract base series slug
  if (cleanId.includes("-episode-")) {
    const baseSlug = cleanId.replace(/-episode-\d+.*$/i, "");
    cleanId = `drama/${baseSlug}`;
  }

  const dramaInfo = {
    id: cleanId,
    title: "",
    image: null,
    image_url: null,
    description: "",
    genres: [],
    status: "Unknown",
    type: cleanId.startsWith("movie/") ? "Movie" : "Drama",
    aired: "",
    country: "",
    totalEpisodes: 0,
    episodes: [],
  };

  try {
    // Attempt primary URL based on normalized ID
    let targetUrl = `${baseUrl}/${cleanId}/`;
    let res = await httpGet(targetUrl, {
      headers: { Referer: `${baseUrl}/` },
    });

    // If bare slug returned 404, fallback between drama and movie paths
    if (res.status === 404 && !cleanId.includes("/")) {
      const dramaUrl = `${baseUrl}/drama/${cleanId}/`;
      const dramaRes = await httpGet(dramaUrl, { headers: { Referer: `${baseUrl}/` } });
      if (dramaRes.status === 200) {
        targetUrl = dramaUrl;
        cleanId = `drama/${cleanId}`;
        dramaInfo.id = cleanId;
        res = dramaRes;
      } else {
        const movieUrl = `${baseUrl}/movie/${cleanId}/`;
        const movieRes = await httpGet(movieUrl, { headers: { Referer: `${baseUrl}/` } });
        if (movieRes.status === 200) {
          targetUrl = movieUrl;
          cleanId = `movie/${cleanId}`;
          dramaInfo.id = cleanId;
          dramaInfo.type = "Movie";
          res = movieRes;
        }
      }
    }

    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return dramaInfo;

    const $ = cheerio.load(html);

    // 1. Structured Data Extraction via JSON-LD
    let structuredItem = null;
    $("script[type=\"application/ld+json\"]").each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        if (json["@graph"] && Array.isArray(json["@graph"])) {
          const item = json["@graph"].find(
            (x) => x["@type"] === "TVSeries" || x["@type"] === "Movie",
          );
          if (item) structuredItem = item;
        } else if (json["@type"] === "TVSeries" || json["@type"] === "Movie") {
          structuredItem = json;
        }
      } catch (_) {}
    });

    if (structuredItem) {
      dramaInfo.title = structuredItem.name || "";
      dramaInfo.description = structuredItem.description || "";
      if (structuredItem.image) {
        const imgUrl =
          typeof structuredItem.image === "string"
            ? structuredItem.image
            : structuredItem.image.url || null;
        dramaInfo.image = imgUrl;
        dramaInfo.image_url = imgUrl;
      }
      if (Array.isArray(structuredItem.genre)) {
        dramaInfo.genres = structuredItem.genre
          .map((g) => (typeof g === "string" ? g : g?.name || ""))
          .filter(Boolean);
      }
      if (structuredItem.countryOfOrigin) {
        dramaInfo.country =
          typeof structuredItem.countryOfOrigin === "string"
            ? structuredItem.countryOfOrigin
            : structuredItem.countryOfOrigin.name || "";
      }

      if (structuredItem["@type"] === "TVSeries" && Array.isArray(structuredItem.hasPart)) {
        dramaInfo.episodes = structuredItem.hasPart.map((ep, idx) => {
          const epNum = parseInt(ep.episodeNumber, 10) || idx + 1;
          const url = ep.url || "";
          const epSlug = cleanSlug(url);
          return {
            id: epSlug,
            number: epNum,
            title: ep.name || `Episode ${epNum}`,
            thumbnail: dramaInfo.image,
          };
        });
        dramaInfo.totalEpisodes = dramaInfo.episodes.length;
      }
    }

    // 2. DOM Parsing for Title & Poster Fallbacks
    if (!dramaInfo.title) {
      dramaInfo.title = $("h1").first().text().trim() || cleanId;
    }
    if (!dramaInfo.image) {
      const heroImg = extractBestImg($(".hero-poster img, .hero-bg"));
      dramaInfo.image = heroImg;
      dramaInfo.image_url = heroImg;
    }

    // 3. Extract Metadata from Definition List (<dl>)
    $("dl dt").each((_, el) => {
      const key = $(el).text().trim().toLowerCase();
      const val = $(el).next("dd").text().trim();
      if (!val) return;

      if (key.includes("status")) {
        dramaInfo.status = val;
      } else if (key.includes("year")) {
        dramaInfo.aired = val;
      } else if (key.includes("country") && !dramaInfo.country) {
        dramaInfo.country = val;
      } else if (key.includes("episodes") && dramaInfo.totalEpisodes === 0) {
        dramaInfo.totalEpisodes = parseInt(val, 10) || 0;
      } else if (key.includes("genres") && dramaInfo.genres.length === 0) {
        dramaInfo.genres = val
          .split(/and|,/)
          .map((g) => g.trim())
          .filter(Boolean);
      }
    });

    // 4. Handle Movies
    const isMovie = cleanId.startsWith("movie/") || structuredItem?.["@type"] === "Movie";
    if (isMovie) {
      dramaInfo.type = "Movie";
      if (dramaInfo.episodes.length === 0) {
        dramaInfo.episodes = [
          {
            id: cleanId,
            number: 1,
            title: "Full Movie",
            thumbnail: dramaInfo.image,
          },
        ];
        dramaInfo.totalEpisodes = 1;
      }
      if (dramaInfo.status === "Unknown") {
        dramaInfo.status = "Completed";
      }
    }

    // 5. Fallback DOM Episode Extraction if episodes list is empty
    if (dramaInfo.episodes.length === 0) {
      const seenEps = new Set();
      $("a[href*='-episode-']").each((idx, el) => {
        const href = $(el).attr("href") || "";
        const epSlug = cleanSlug(href);
        if (!epSlug || seenEps.has(epSlug)) return;
        seenEps.add(epSlug);

        const match = epSlug.match(/episode-(\d+)/i);
        const epNum = match ? parseInt(match[1], 10) : idx + 1;
        const text = $(el).text().trim() || `Episode ${epNum}`;

        dramaInfo.episodes.push({
          id: epSlug,
          number: epNum,
          title: text,
          thumbnail: dramaInfo.image,
        });
      });
      dramaInfo.totalEpisodes = dramaInfo.episodes.length;
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
 * Fetch playable stream sources and subtitles for an episode or movie.
 * @param {string} episodeId - e.g. "northern-storm-2026-episode-1-with-english-subtitle" or "movie/morte-cucina-2025"
 * @param {string|null} category
 * @returns {Promise<{ sources: Array<any>, subtitles: Array<any> }>}
 */
async function fetchEpisodeSources(episodeId, category = null) {
  const sources = [];
  const subtitles = [];

  try {
    const cleanId = cleanSlug(episodeId);
    if (!cleanId) return { sources, subtitles };

    // Register stream headers for StrawVerse internal proxy & MPV player
    if (typeof _global.registerStreamHeaders === "function") {
      _global.registerStreamHeaders("kaidrama.com", {
        Referer: "https://kaidrama.com/",
        Origin: "https://kaidrama.com",
      });
      _global.registerStreamHeaders("zumivids.com", {
        Referer: "https://kaidrama.com/",
        Origin: "https://kaidrama.com",
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
      _global.registerStreamHeaders("tapecontent.net", {
        Referer: "https://streamtape.com/",
      });
      _global.registerStreamHeaders("mixdrop.top", {
        Referer: "https://mixdrop.top/",
      });
      _global.registerStreamHeaders("mxcontent.net", {
        Referer: "https://mixdrop.top/",
      });
    }

    if (typeof _global.registerSubrequestHeaders === "function") {
      _global.registerSubrequestHeaders("vmnow.online", {
        Referer: "https://vidmoly.org/",
        Origin: "https://vidmoly.org",
      });
      _global.registerSubrequestHeaders("vmpx.online", {
        Referer: "https://vidmoly.org/",
        Origin: "https://vidmoly.org",
      });
      _global.registerSubrequestHeaders("mxcontent.net", {
        Referer: "https://mixdrop.top/",
      });
    }

    const episodeUrl = `${baseUrl}/${cleanId}/`;
    const res = await httpGet(episodeUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return { sources, subtitles };

    const $ = cheerio.load(html);

    // Extract player server embed URLs
    const embedUrls = new Set();
    $(".player-server").each((_, el) => {
      const src = $(el).attr("data-src") || $(el).attr("href");
      if (src && src.startsWith("http")) embedUrls.add(src);
    });

    $("a[data-src], iframe[src], iframe[data-src]").each((_, el) => {
      const src = $(el).attr("data-src") || $(el).attr("src");
      if (src && src.startsWith("http")) embedUrls.add(src);
    });

    const candidateVideos = [];

    // Inspect each embed container (e.g. zumivids.com)
    for (const embedUrl of embedUrls) {
      if (embedUrl.includes("zumivids.com")) {
        try {
          const zumiRes = await httpGet(embedUrl, {
            headers: {
              Referer: `${baseUrl}/`,
              Origin: baseUrl,
            },
          });
          const zumiHtml = typeof zumiRes.data === "string" ? zumiRes.data : "";
          if (zumiHtml) {
            const $zumi = cheerio.load(zumiHtml);
            $zumi("#serverList li, .server-item").each((_, el) => {
              const video = $zumi(el).attr("data-video");
              const server = $zumi(el).attr("data-server");
              if (video && !candidateVideos.some((c) => c.video === video)) {
                candidateVideos.push({ video, server });
              }
            });
          }
        } catch (_) {}
      } else if (
        embedUrl.includes("vidmoly") ||
        embedUrl.includes("streamtape") ||
        embedUrl.includes("mixdrop")
      ) {
        candidateVideos.push({ video: embedUrl, server: "direct" });
      }
    }

    // Resolve candidates into direct media streams
    for (const item of candidateVideos) {
      const videoUrl = item.video;
      if (!videoUrl) continue;

      // 1. Vidmoly -> direct master .m3u8
      if (videoUrl.includes("vidmoly")) {
        const resolved = await resolveVidmolyStream(videoUrl);
        if (resolved?.url && !sources.some((s) => s.url === resolved.url)) {
          sources.push({
            name: "KaiDrama Vidmoly (HLS)",
            quality: "HD (Auto)",
            url: resolved.url,
            isM3U8: true,
            headers: resolved.headers,
          });
        }
      }

      // 2. Streamtape -> direct .mp4
      else if (videoUrl.includes("streamtape")) {
        const resolved = await resolveStreamtapeStream(videoUrl);
        if (resolved?.url && !sources.some((s) => s.url === resolved.url)) {
          sources.push({
            name: "KaiDrama Streamtape (MP4)",
            quality: "720p (MP4)",
            url: resolved.url,
            isM3U8: false,
            headers: resolved.headers,
          });
        }
      }

      // 3. MixDrop -> direct .mp4
      else if (videoUrl.includes("mixdrop")) {
        const resolved = await resolveMixdropStream(videoUrl);
        if (resolved?.url && !sources.some((s) => s.url === resolved.url)) {
          sources.push({
            name: "KaiDrama MixDrop (MP4)",
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
 * Fetch recently updated episodes / dramas from Kaidrama.
 * @param {number|object} page
 */
async function fetchRecentEpisodes(page = 1) {
  let pageNum = 1;
  if (typeof page === "number") {
    pageNum = Math.max(1, page);
  } else if (page && typeof page === "object") {
    pageNum = Math.max(1, parseInt(page.page, 10) || 1);
  }

  const results = [];
  const seenIds = new Set();
  let hasNext = false;
  let totalPages = 50;

  try {
    const targetUrl =
      pageNum === 1
        ? `${baseUrl}/new-episodes/`
        : `${baseUrl}/new-episodes/page/${pageNum}/`;

    const res = await httpGet(targetUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) {
      return { results, hasNextPage: false, currentPage: pageNum, totalPages: 0 };
    }

    const $ = cheerio.load(html);

    if ($("a.pagination-link[aria-label*='Next']").length > 0) {
      hasNext = true;
    }

    $("li.card, .card").each((_, el) => {
      const title = $(el).find(".card-title, h2, h3").text().trim();
      const href = $(el).find("a.card-link").attr("href") || "";
      const epSlug = cleanSlug(href);
      if (!epSlug) return;

      // Extract base drama slug from episode url e.g. "love-me-to-hurt-me-2026-episode-1-with-english-subtitle"
      const dramaSlug = epSlug.replace(/-episode-\d+.*$/i, "");
      const seriesId = `drama/${dramaSlug}`;
      if (seenIds.has(seriesId)) return;
      seenIds.add(seriesId);

      const img = extractBestImg($(el).find("img"));
      const meta = $(el).find(".card-meta").text().trim();
      const epText = meta.includes("Episode")
        ? meta.replace(/Episode\s*/i, "Ep ")
        : meta;

      let releaseYear = "";
      const yearMatch = title.match(/\((\d{4})\)/);
      if (yearMatch) {
        releaseYear = yearMatch[1];
      }

      results.push({
        id: seriesId,
        title,
        image: img,
        type: "Drama",
        subDub: "Sub",
        releaseYear,
        status: "Ongoing",
        episode: epText || null,
      });
    });

    return {
      results,
      hasNextPage: hasNext,
      currentPage: pageNum,
      totalPages,
    };
  } catch (err) {
    return {
      results: [],
      hasNextPage: false,
      currentPage: pageNum,
      totalPages: 0,
    };
  }
}

module.exports = {
  name: "kaidrama",
  version: "1.0.0",
  baseUrl,
  headerRules,
  subrequestHeaders,
  bypassDomains,
  SearchAnime,
  SearchMovie: SearchAnime,
  AnimeInfo,
  MovieInfo: AnimeInfo,
  fetchEpisode,
  fetchEpisodeSources,
  fetchRecentEpisodes,
  fetchTrending: fetchRecentEpisodes,
};
