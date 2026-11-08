/**
 * StrawVerse Extension - HDHub4u Scraper
 * Bollywood, Hollywood, South Indian Movies & TV Shows in Hindi Dubbed, Dual Audio
 * Supports multi-quality HLS streams with multiple audio tracks and subtitles.
 * Based on https://new12.hdhub4u.cl/ and StrawVerse Extension Specification.
 */

const cheerio = require("cheerio");

const baseUrl = "https://new12.hdhub4u.cl";
const searchApiUrl =
  "https://search.pingora.fyi/collections/post/documents/search";

// PlayDrive seal key for decrypting pa!~ sealed HLS URLs
const PA_SEAL_KEY = "pa4u-stream-seal-v1";
const PA_PREFIX = "pa!~";

// Declarative header rules for HDHub4u and its CDNs
const headerRules = [
  {
    match: ["hdhub4u.cl", "hdhub4u.ec", "hdhub4u.deal"],
    headers: {
      Referer: `${baseUrl}/`,
      Origin: baseUrl,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
  {
    match: ["playdrive.vip", "play4u.org"],
    headers: {
      Referer: `${baseUrl}/`,
      Origin: baseUrl,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
  {
    match: ["gothamnet.vip", "uprising.best"],
    headers: {
      Referer: "https://playdrive.vip/",
      Origin: "https://playdrive.vip",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
  {
    match: ["hdstream4u.com"],
    headers: {
      Referer: `${baseUrl}/`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
  {
    match: ["acek-cdn.com", "radiantgroveproduction.cfd"],
    headers: {
      Referer: "https://hdstream4u.com/",
      Origin: "https://hdstream4u.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: ["gothamnet.vip", "uprising.best"],
    headers: {
      Referer: "https://playdrive.vip/",
      Origin: "https://playdrive.vip",
    },
  },
  {
    match: ["acek-cdn.com", "radiantgroveproduction.cfd"],
    headers: {
      Referer: "https://hdstream4u.com/",
      Origin: "https://hdstream4u.com",
    },
  },
];

const bypassDomains = [
  "hdhub4u.cl",
  "hdhub4u.ec",
  "hdhub4u.deal",
  "playdrive.vip",
  "play4u.org",
  "gothamnet.vip",
  "uprising.best",
  "hdstream4u.com",
  "acek-cdn.com",
  "radiantgroveproduction.cfd",
  "pixibay.cc",
  "search.pingora.fyi",
];

const _global =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof global !== "undefined"
    ? global
    : {};

// ────────────────────────────────────────────
//  HTTP Helper
// ────────────────────────────────────────────

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

// ────────────────────────────────────────────
//  Utility Functions
// ────────────────────────────────────────────

function cleanSlug(str) {
  if (!str || typeof str !== "string") return "";
  let clean = str.trim();
  clean = clean.replace(/^https?:\/\/[^\/]+/i, "");
  clean = clean.replace(/^\/*|\/*$/g, "");
  return clean;
}

/**
 * Extract clean movie/series title from HDHub4u post title.
 * e.g. "Deadpool & Wolverine (2024) BluRay [Hindi (ORG 5.1) & English] ..." → "Deadpool & Wolverine"
 */
function extractCleanTitle(rawTitle) {
  if (!rawTitle) return "";
  let t = rawTitle
    .replace(/&#0?38;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'");
  // Cut off at year in parentheses or quality markers
  const cutMatch = t.match(
    /^(.+?)\s*(?:\(\d{4}\)|\d{4}\s|BluRay|WEB-?DL|WEB-?Rip|HDRip|HDTC|HDCAM|DVDRip|\[)/i,
  );
  if (cutMatch) t = cutMatch[1];
  return t.trim();
}

/**
 * Extract year from title string.
 */
function extractYear(rawTitle) {
  if (!rawTitle) return "";
  const m = rawTitle.match(/\((\d{4})\)/);
  return m ? m[1] : "";
}

/**
 * Determine if a post is a TV series based on title/slug patterns.
 */
function isSeries(title, slug) {
  const t = (title + " " + slug).toLowerCase();
  return (
    /season\s*\d/i.test(t) ||
    /\bfull[\s-]*series\b/i.test(t) ||
    /\ball[\s-]*episodes?\b/i.test(t) ||
    /\bweb[\s-]*series\b/i.test(t)
  );
}

/**
 * Extract season number from title.
 */
function extractSeason(rawTitle) {
  if (!rawTitle) return null;
  const m = rawTitle.match(/season\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ────────────────────────────────────────────
//  PlayDrive Unseal (pa!~ XOR decryption)
// ────────────────────────────────────────────

function paUnseal(sealed) {
  if (!sealed || typeof sealed !== "string") return sealed;
  if (!sealed.startsWith(PA_PREFIX)) return sealed;

  let b64str = sealed.slice(PA_PREFIX.length);
  // URL-safe base64 → standard base64
  b64str = b64str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64str.length % 4;
  if (pad) b64str += "====".slice(pad);

  let raw;
  if (typeof atob === "function") {
    try {
      raw = atob(b64str);
    } catch (_) {
      return "";
    }
  } else if (typeof Buffer !== "undefined") {
    raw = Buffer.from(b64str, "base64").toString("binary");
  } else {
    return "";
  }

  // XOR with seal key
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    result += String.fromCharCode(
      raw.charCodeAt(i) ^ PA_SEAL_KEY.charCodeAt(i % PA_SEAL_KEY.length),
    );
  }
  return result;
}

/**
 * Walk an object tree and unseal any pa!~ URLs in known video-related keys.
 */
function paUnsealTree(obj) {
  if (!obj || typeof obj !== "object") return;
  const SEAL_KEYS = new Set([
    "video_url",
    "thumbs_url",
    "thumbs_sprite_url",
    "m3u8_url",
    "thumbs_vtt_url",
    "hls",
    "thumbs_vtt",
    "thumbs_sprite",
  ]);
  if (Array.isArray(obj)) {
    for (const item of obj) paUnsealTree(item);
    return;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && SEAL_KEYS.has(key)) {
      obj[key] = paUnseal(val);
    } else if (val && typeof val === "object") {
      paUnsealTree(val);
    }
  }
}

// ────────────────────────────────────────────
//  JWPlayer p,a,c,k Unpacker (for hdstream4u)
// ────────────────────────────────────────────

function baseN(num, base) {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (num < base) return chars[num];
  return baseN(Math.floor(num / base), base) + chars[num % base];
}

function unpackJWPlayer(packedHtml) {
  const match = packedHtml.match(
    /eval\(function\(p,a,c,k,e,d\)\{while.*?\}\('([\s\S]*?)',(\d+),(\d+),'([^']*)'/,
  );
  if (!match) return null;

  const p = match[1];
  const a = parseInt(match[2], 10);
  let c = parseInt(match[3], 10);
  const k = match[4].split("|");

  let result = p;
  while (c > 0) {
    c--;
    if (k[c]) {
      const token = baseN(c, a);
      result = result.replace(new RegExp("\\b" + token + "\\b", "g"), k[c]);
    }
  }
  return result;
}

// ────────────────────────────────────────────
//  Search Relevance
// ────────────────────────────────────────────

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
      else
        dp[i][j] =
          1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function isRelevantMatch(itemTitle, query) {
  const t = (itemTitle || "").toLowerCase().trim();
  const q = (query || "").toLowerCase().trim();
  if (!t || !q) return false;

  if (t === q || t.includes(q)) return true;

  const cleanT = t
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanQ = q
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

// ────────────────────────────────────────────
//  SearchAnime — Typesense search API
// ────────────────────────────────────────────

/**
 * Search movies and TV series on HDHub4u via Typesense API.
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
    return {
      results: [],
      hasNextPage: false,
      currentPage: pageNum,
      totalPages: 0,
    };
  }

  try {
    const apiUrl = new URL(searchApiUrl);
    apiUrl.searchParams.set("q", searchQuery);
    apiUrl.searchParams.set(
      "query_by",
      "post_title,category,stars,director,imdb_id",
    );
    apiUrl.searchParams.set("query_by_weights", "4,2,2,2,4");
    apiUrl.searchParams.set("sort_by", "sort_by_date:desc");
    apiUrl.searchParams.set("limit", "20");
    apiUrl.searchParams.set("highlight_fields", "none");
    apiUrl.searchParams.set("use_cache", "true");
    apiUrl.searchParams.set("page", String(pageNum));

    const res = await httpGet(apiUrl.toString(), {
      headers: {
        Referer: `${baseUrl}/search.html`,
        Origin: baseUrl,
      },
    });

    const data = typeof res.data === "object" ? res.data : {};
    if (!data.hits || !Array.isArray(data.hits)) {
      return {
        results: [],
        hasNextPage: false,
        currentPage: pageNum,
        totalPages: 0,
      };
    }

    const totalFound = data.found || 0;
    const totalPages = Math.max(1, Math.ceil(totalFound / 20));
    const hasNext = pageNum < totalPages;

    const results = [];
    const seenIds = new Set();

    for (const hit of data.hits) {
      const doc = hit.document || {};
      if (!doc.permalink || !doc.post_title) continue;

      const slug = cleanSlug(doc.permalink);
      if (!slug || seenIds.has(slug)) continue;
      seenIds.add(slug);

      const rawTitle = doc.post_title || "";
      const cleanTitle = extractCleanTitle(rawTitle);
      const year = extractYear(rawTitle);
      const series = isSeries(rawTitle, slug);
      const thumbnail =
        doc.post_thumbnail ||
        (doc.imdb_id
          ? `https://image.tmdb.org/t/p/w342/${doc.imdb_id}`
          : null);

      results.push({
        id: slug,
        title: rawTitle,
        image: thumbnail,
        type: series ? "TV" : "Movie",
        subDub: "Dub",
        releaseYear: year,
        status: series ? "Unknown" : "Completed",
      });
    }

    // Relevance filter and sort
    const filteredResults = results.filter((r) =>
      isRelevantMatch(extractCleanTitle(r.title), searchQuery),
    );
    filteredResults.sort((a, b) => {
      const cleanA = extractCleanTitle(a.title);
      const cleanB = extractCleanTitle(b.title);
      return (
        calculateRelevance(cleanB, searchQuery) -
        calculateRelevance(cleanA, searchQuery)
      );
    });

    return {
      results: filteredResults.length > 0 ? filteredResults : results,
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

// ────────────────────────────────────────────
//  AnimeInfo — Detail page parsing
// ────────────────────────────────────────────

/**
 * Fetch detailed movie/series metadata and episode list.
 * @param {string} id - Post slug e.g. "deadpool-wolverine-2024-hindi-bluray-full-movie"
 */
async function AnimeInfo(id) {
  let cleanId = cleanSlug(id);

  const info = {
    id: cleanId,
    title: "",
    image: null,
    image_url: null,
    description: "",
    genres: [],
    status: "Unknown",
    type: "Movie",
    aired: "",
    country: "",
    totalEpisodes: 0,
    episodes: [],
  };

  try {
    const targetUrl = `${baseUrl}/${cleanId}/`;
    const res = await httpGet(targetUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return info;

    const $ = cheerio.load(html);

    // 1. Extract title from page <title>
    const pageTitle = $("title").text().trim();
    if (pageTitle) {
      info.title = pageTitle
        .replace(/\s*[-–|]\s*HDHub4u.*$/i, "")
        .replace(/&#0?38;/g, "&")
        .replace(/&amp;/g, "&")
        .trim();
    }
    if (!info.title) {
      info.title = $("h1").first().text().trim() || cleanId;
    }

    // 2. Extract poster image (TMDB)
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage && ogImage.includes("tmdb.org")) {
      info.image = ogImage.replace(/\/w\d+\//, "/w500/");
      info.image_url = info.image;
    }
    if (!info.image) {
      // Try first image from content
      const firstImg = $("img[src*='tmdb.org']").first().attr("src");
      if (firstImg) {
        info.image = firstImg.replace(/\/w\d+\//, "/w500/");
        info.image_url = info.image;
      }
    }

    // 3. Extract genres from .page-meta category links only (not sidebar/navbar)
    //    The <a> contains <i class="material-icons">icon</i><em>Text</em>
    //    so we read text from <em> to avoid icon font glyphs polluting the string.
    $(".page-meta a[href*='/category/']").each((_, el) => {
      const emText = $(el).find("em").text().trim();
      const cat = emText || $(el).text().replace(/[^\x20-\x7E]/g, "").trim();
      // Skip non-genre categories (site/format labels, not actual genres)
      if (
        cat &&
        !/(300mb|hd movies|dual audio|bollywood|hollywood|south|hindi|web-series|unofficial|voiceover|collection|awards|talk|trailers|wrestling|punjabi|gujarati)/i.test(
          cat,
        )
      ) {
        if (!info.genres.includes(cat)) info.genres.push(cat);
      }
    });

    // 4. Extract IMDB link for description
    const imdbLink = $('a[href*="imdb.com/title/"]').attr("href");
    if (imdbLink) {
      const imdbMatch = imdbLink.match(/tt\d+/);
      if (imdbMatch) {
        info.description = `IMDB: ${imdbMatch[0]}`;
      }
    }

    // 5. Determine type and year
    const titleStr = info.title + " " + cleanId;
    info.type = isSeries(titleStr, cleanId) ? "TV" : "Movie";
    info.aired = extractYear(info.title);

    // 6. Parse episodes for series
    if (info.type === "TV") {
      const episodes = [];
      const seenEps = new Set();

      // Parse episode structure from heading patterns
      // HDHub4u uses: <h3>EPiSODE N</h3> followed by quality links
      const headings = [];
      $("h2, h3, h4").each((_, el) => {
        headings.push({
          tag: el.tagName,
          text: $(el).text().trim(),
          html: $(el).html(),
        });
      });

      let currentEp = null;
      let epLinks = {};

      for (const h of headings) {
        const epMatch = h.text.match(/EP[iI]SODE\s*(\d+)/);
        if (epMatch) {
          // Save previous episode
          if (currentEp && Object.keys(epLinks).length > 0) {
            if (!seenEps.has(currentEp)) {
              seenEps.add(currentEp);
              episodes.push({
                id: `${cleanId}::ep${currentEp}`,
                number: currentEp,
                title: `Episode ${currentEp}`,
                thumbnail: info.image,
                _links: { ...epLinks },
              });
            }
          }
          currentEp = parseInt(epMatch[1], 10);
          epLinks = {};
          continue;
        }

        if (currentEp) {
          // Extract links from this heading
          const $h = cheerio.load(h.html || "");
          $h("a").each((_, el) => {
            const href = $h(el).attr("href") || "";
            const text = $h(el).text().trim().toUpperCase();
            if (href.includes("hdstream4u.com")) {
              epLinks.watch = href;
            } else if (href.includes("playdrive.vip") || href.includes("play4u.org")) {
              epLinks.playdrive = href;
            } else if (href.includes("hubdrive.blog")) {
              if (!epLinks.hubdrive720 && h.text.includes("720"))
                epLinks.hubdrive720 = href;
              else if (!epLinks.hubdrive1080) epLinks.hubdrive1080 = href;
            } else if (href.includes("hubcdn.club")) {
              if (!epLinks.hubcdn) epLinks.hubcdn = href;
            }
          });
        }
      }

      // Push last episode
      if (currentEp && Object.keys(epLinks).length > 0 && !seenEps.has(currentEp)) {
        seenEps.add(currentEp);
        episodes.push({
          id: `${cleanId}::ep${currentEp}`,
          number: currentEp,
          title: `Episode ${currentEp}`,
          thumbnail: info.image,
          _links: { ...epLinks },
        });
      }

      // If no per-episode links found, look for batch playdrive/watch links
      if (episodes.length === 0) {
        // Check for playdrive batch link
        const playdriveLink = $('a[href*="playdrive.vip"], a[href*="play4u.org"]')
          .first()
          .attr("href");
        const watchLink = $('a[href*="hdstream4u.com"]').first().attr("href");
        const fourKLink = $('a[href*="4khdhub.one"]')
          .filter((_, el) => {
            const href = $(el).attr("href") || "";
            return href.includes("/") && href !== "https://4khdhub.one";
          })
          .first()
          .attr("href");

        episodes.push({
          id: cleanId,
          number: 1,
          title: "Full Series (Batch)",
          thumbnail: info.image,
          _links: {
            playdrive: playdriveLink || null,
            watch: watchLink || null,
            fourk: fourKLink || null,
          },
        });
      }

      info.episodes = episodes;
      info.totalEpisodes = episodes.length;
      info.status = "Completed";
    } else {
      // Movie — single episode
      const playdriveLink = $('a[href*="playdrive.vip"], a[href*="play4u.org"]')
        .first()
        .attr("href");
      const watchLink = $('a[href*="hdstream4u.com"]').first().attr("href");

      info.episodes = [
        {
          id: cleanId,
          number: 1,
          title: "Full Movie",
          thumbnail: info.image,
          _links: {
            playdrive: playdriveLink || null,
            watch: watchLink || null,
          },
        },
      ];
      info.totalEpisodes = 1;
      info.status = "Completed";
    }

    return info;
  } catch (err) {
    return info;
  }
}

// ────────────────────────────────────────────
//  fetchEpisode
// ────────────────────────────────────────────

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

// ────────────────────────────────────────────
//  Source Resolvers
// ────────────────────────────────────────────

/**
 * Resolve PlayDrive embed into direct HLS m3u8 stream.
 * PlayDrive uses pa!~ XOR-sealed URLs in __PA_PLAY__ data.
 */
async function resolvePlayDrive(embedUrl) {
  try {
    let embedOrigin = "https://playdrive.vip";
    try {
      const u = new URL(embedUrl);
      embedOrigin = `${u.protocol}//${u.host}`;
    } catch (_) {}

    const res = await httpGet(embedUrl, {
      headers: {
        Referer: `${baseUrl}/`,
      },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return null;

    // Extract __PA_PLAY__ JSON
    const match = html.match(
      /window\.__PA_PLAY__\s*=\s*(\{.*?\});\s*(?:$|window|<\/script>)/s,
    );
    if (!match) return null;

    let playData;
    try {
      playData = JSON.parse(match[1]);
    } catch (_) {
      return null;
    }

    if (!playData || !playData.ok) return null;

    // Unseal all sealed URLs in the tree
    paUnsealTree(playData);

    const results = [];

    // Process streams
    if (Array.isArray(playData.streams)) {
      for (const stream of playData.streams) {
        const m3u8Url = stream.m3u8_url;
        if (!m3u8Url || !m3u8Url.startsWith("http")) continue;

        // Build quality label from available qualities
        const qualityLabels = (stream.qualities || [])
          .map((q) => q.label)
          .join(" / ");
        const langLabels = (stream.languages || [])
          .map((l) => l.name)
          .join(", ");

        results.push({
          url: m3u8Url,
          quality: qualityLabels
            ? `${qualityLabels} (HLS)`
            : "1080p / 720p (HLS)",
          name: `HDHub4u Stream${langLabels ? ` [${langLabels}]` : ""} (HLS)`,
          isM3U8: true,
          headers: {
            Referer: `${embedOrigin}/`,
            Origin: embedOrigin,
          },
        });
      }
    }

    // Fallback: item.video_url
    if (results.length === 0 && playData.item && playData.item.video_url) {
      const videoUrl = playData.item.video_url;
      if (videoUrl.startsWith("http")) {
        results.push({
          url: videoUrl,
          quality: "1080p / 720p (HLS)",
          name: "HDHub4u Stream (HLS)",
          isM3U8: true,
          headers: {
            Referer: `${embedOrigin}/`,
            Origin: embedOrigin,
          },
        });
      }
    }

    // Extract subtitles from the m3u8 master playlist if we have VTT URLs
    const subtitles = [];
    if (playData.streams) {
      for (const stream of playData.streams) {
        if (stream.languages) {
          for (const lang of stream.languages) {
            if (lang.code === "en" && stream.thumbs_vtt_url) {
              // VTT subtitles are typically in the HLS manifest itself
              // so no separate subtitle track needed
            }
          }
        }
      }
    }

    return { sources: results, subtitles };
  } catch (_) {
    return null;
  }
}

/**
 * Resolve hdstream4u.com embed into direct HLS m3u8 stream.
 * Uses JWPlayer with p,a,c,k packed JavaScript.
 */
async function resolveHDStream4u(fileUrl) {
  try {
    // Convert file URL to embed URL
    let embedUrl = fileUrl;
    if (fileUrl.includes("/file/")) {
      embedUrl = fileUrl.replace("/file/", "/embed/");
    }

    const res = await httpGet(embedUrl, {
      headers: {
        Referer: `${baseUrl}/`,
      },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return null;

    // Unpack JWPlayer config
    const unpacked = unpackJWPlayer(html);
    if (!unpacked) return null;

    // Extract m3u8 URL from unpacked code
    const m3u8Match = unpacked.match(
      /["'](https?:\/\/[^"'\\]+\.m3u8[^"'\\]*?)["']/,
    );
    if (!m3u8Match) return null;

    const m3u8Url = m3u8Match[1]
      .replace(/\\u0026/g, "&")
      .replace(/\\&/g, "&");

    // Extract subtitle VTT URL
    const subtitles = [];
    const vttMatch = unpacked.match(
      /["'](https?:\/\/[^"'\\]+\.vtt[^"'\\]*?)["']/,
    );
    if (vttMatch) {
      subtitles.push({
        lang: "English",
        url: vttMatch[1],
      });
    }

    return {
      sources: [
        {
          url: m3u8Url,
          quality: "720p / 480p (HLS)",
          name: "HDHub4u VidHide (HLS)",
          isM3U8: true,
          headers: {
            Referer: "https://hdstream4u.com/",
            Origin: "https://hdstream4u.com",
          },
        },
      ],
      subtitles,
    };
  } catch (_) {
    return null;
  }
}

// ────────────────────────────────────────────
//  fetchEpisodeSources
// ────────────────────────────────────────────

/**
 * Fetch playable stream sources for a movie or episode.
 * @param {string} episodeId - Post slug or "slug::epN" for series episodes
 * @param {string|null} category
 */
async function fetchEpisodeSources(episodeId, category = null) {
  const sources = [];
  const subtitles = [];

  try {
    const cleanId = cleanSlug(episodeId);
    if (!cleanId) return { sources, subtitles };

    // Register stream headers for StrawVerse proxy & MPV player
    if (typeof _global.registerStreamHeaders === "function") {
      _global.registerStreamHeaders("playdrive.vip", {
        Referer: `${baseUrl}/`,
        Origin: baseUrl,
      });
      _global.registerStreamHeaders("play4u.org", {
        Referer: `${baseUrl}/`,
        Origin: baseUrl,
      });
      _global.registerStreamHeaders("gothamnet.vip", {
        Referer: "https://playdrive.vip/",
        Origin: "https://playdrive.vip",
      });
      _global.registerStreamHeaders("uprising.best", {
        Referer: "https://play4u.org/",
        Origin: "https://play4u.org",
      });
      _global.registerStreamHeaders("hdstream4u.com", {
        Referer: `${baseUrl}/`,
      });
      _global.registerStreamHeaders("acek-cdn.com", {
        Referer: "https://hdstream4u.com/",
        Origin: "https://hdstream4u.com",
      });
      _global.registerStreamHeaders("radiantgroveproduction.cfd", {
        Referer: "https://hdstream4u.com/",
        Origin: "https://hdstream4u.com",
      });
    }

    if (typeof _global.registerSubrequestHeaders === "function") {
      _global.registerSubrequestHeaders("gothamnet.vip", {
        Referer: "https://playdrive.vip/",
        Origin: "https://playdrive.vip",
      });
      _global.registerSubrequestHeaders("uprising.best", {
        Referer: "https://play4u.org/",
        Origin: "https://play4u.org",
      });
      _global.registerSubrequestHeaders("acek-cdn.com", {
        Referer: "https://hdstream4u.com/",
        Origin: "https://hdstream4u.com",
      });
      _global.registerSubrequestHeaders("radiantgroveproduction.cfd", {
        Referer: "https://hdstream4u.com/",
        Origin: "https://hdstream4u.com",
      });
    }

    // Determine if this is a per-episode ID (slug::epN)
    let postSlug = cleanId;
    let episodeNum = null;
    const epSplit = cleanId.split("::");
    if (epSplit.length === 2 && epSplit[1].startsWith("ep")) {
      postSlug = epSplit[0];
      episodeNum = parseInt(epSplit[1].replace("ep", ""), 10);
    }

    // Fetch the detail page to find watch links
    const targetUrl = `${baseUrl}/${postSlug}/`;
    const res = await httpGet(targetUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return { sources, subtitles };

    const $ = cheerio.load(html);

    let playdriveUrl = null;
    let hdstreamUrl = null;

    if (episodeNum) {
      // Per-episode: find the specific episode's links
      const headings = [];
      $("h2, h3, h4").each((_, el) => {
        headings.push({
          text: $(el).text().trim(),
          html: $(el).html(),
        });
      });

      let currentEp = null;
      for (const h of headings) {
        const epMatch = h.text.match(/EP[iI]SODE\s*(\d+)/);
        if (epMatch) {
          currentEp = parseInt(epMatch[1], 10);
          continue;
        }

        if (currentEp === episodeNum) {
          const $h = cheerio.load(h.html || "");
          $h("a").each((_, el) => {
            const href = $h(el).attr("href") || "";
            if (href.includes("hdstream4u.com") && !hdstreamUrl) {
              hdstreamUrl = href;
            }
            if (
              (href.includes("playdrive.vip") ||
                href.includes("play4u.org")) &&
              !playdriveUrl
            ) {
              playdriveUrl = href;
            }
          });
        }
      }
    } else {
      // Movie or batch: use the first playdrive/play4u/hdstream link found
      playdriveUrl =
        $('a[href*="playdrive.vip"], a[href*="play4u.org"]')
          .first()
          .attr("href") || null;
      hdstreamUrl =
        $('a[href*="hdstream4u.com"]').first().attr("href") || null;
    }

    // 1. Try PlayDrive first (best quality: multi-audio, multi-quality HLS)
    if (playdriveUrl) {
      const pdResult = await resolvePlayDrive(playdriveUrl);
      if (pdResult) {
        for (const s of pdResult.sources) {
          if (!sources.some((x) => x.url === s.url)) {
            sources.push(s);
          }
        }
        for (const sub of pdResult.subtitles || []) {
          if (!subtitles.some((x) => x.url === sub.url)) {
            subtitles.push(sub);
          }
        }
      }
    }

    // 2. Try HDStream4u as backup (single audio HLS)
    if (hdstreamUrl) {
      const hsResult = await resolveHDStream4u(hdstreamUrl);
      if (hsResult) {
        for (const s of hsResult.sources) {
          if (!sources.some((x) => x.url === s.url)) {
            sources.push(s);
          }
        }
        for (const sub of hsResult.subtitles || []) {
          if (!subtitles.some((x) => x.url === sub.url)) {
            subtitles.push(sub);
          }
        }
      }
    }

    return { sources, subtitles };
  } catch (err) {
    return { sources, subtitles };
  }
}

// ────────────────────────────────────────────
//  fetchRecentEpisodes — Homepage WordPress
// ────────────────────────────────────────────

/**
 * Fetch recently posted movies/shows from HDHub4u homepage.
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
  let totalPages = 974; // HDHub4u has ~974 pages

  try {
    const targetUrl =
      pageNum === 1 ? `${baseUrl}/` : `${baseUrl}/page/${pageNum}/`;

    const res = await httpGet(targetUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) {
      return {
        results,
        hasNextPage: false,
        currentPage: pageNum,
        totalPages: 0,
      };
    }

    const $ = cheerio.load(html);

    // Check for next page
    if ($('a.page-numbers[href*="/page/"]').length > 0) {
      hasNext = true;
    }

    // Parse movie/show listings from <li class="thumb ..."> elements
    $("li.thumb").each((_, el) => {
      const $item = $(el);

      // Find the first <a> link in the item
      const href = $item.find("a").first().attr("href") || "";
      const slug = cleanSlug(href);
      if (!slug || seenIds.has(slug)) return;
      seenIds.add(slug);

      // Title from figcaption > a > p
      let title = $item.find("figcaption p").first().text().trim();
      if (!title) {
        title =
          $item.find("a").first().attr("aria-label") ||
          $item.find("a").first().attr("title") ||
          "";
      }
      title = title
        .replace(/&#0?38;/g, "&")
        .replace(/&amp;/g, "&")
        .trim();

      // Image from figure img
      const img =
        $item.find("img").attr("data-src") ||
        $item.find("img").attr("src") ||
        null;

      const year = extractYear(title);
      const series = isSeries(title, slug);

      results.push({
        id: slug,
        title: title || slug,
        image: img,
        type: series ? "TV" : "Movie",
        subDub: "Dub",
        releaseYear: year,
        status: series ? "Ongoing" : "Completed",
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

// ────────────────────────────────────────────
//  Module Export
// ────────────────────────────────────────────

module.exports = {
  name: "hdhub4u",
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
