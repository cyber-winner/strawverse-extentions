/**
 * StrawVerse Extension - DramaCool Scraper
 * Specializing in Asian Dramas, Kdramas, Cdramas, Jdramas & Movies
 * Based on https://dramacool9.rest and StrawVerse Extension Specification.
 */

const cheerio = require("cheerio");
const crypto = require("crypto");

const baseUrl = "https://dramacool9.rest";

// Decryption keys discovered from DramaCool / Vidbasic player embed
const VIDBASIC_KEY = "94588293375053432799222445521289";
const VIDBASIC_IV = "5259228356829423";

// Declarative header rules for DramaCool, Vidbasic player and stream CDNs
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
      "vidmoly",
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
];

const subrequestHeaders = [
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
 * Search dramas by query string with pagination.
 * @param {string} query
 * @param {number|object} page
 * @returns {Promise<{ results: Array<any>, hasNextPage: boolean, currentPage: number, totalPages?: number }>}
 */
async function SearchAnime(query, page = 1) {
  const pageNum = typeof page === "number" ? Math.max(1, page) : 1;
  const searchQuery = (query || "").trim();

  try {
    const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(searchQuery)}&page=${pageNum}`;
    const res = await httpGet(searchUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) {
      return { results: [], hasNextPage: false, currentPage: pageNum };
    }

    const state = parseNgState(html);
    const results = [];
    let hasNext = false;
    let totalPages = 1;

    if (state) {
      for (const k of Object.keys(state)) {
        const item = state[k];
        if (item?.u?.includes("search") && item?.b?.body) {
          const bodyList = Array.isArray(item.b.body) ? item.b.body : [];
          hasNext = !!item.b.hasNext;
          totalPages = item.b.totalPages || 1;

          for (const d of bodyList) {
            if (!d.slug && !d.name) continue;
            results.push({
              id: d.slug,
              title: d.name || d.normalizedName || d.slug,
              image: d.image || d.coverImage || null,
              type: "Drama",
              subDub: "Sub",
              releaseYear: d.releaseYear || "",
              status: d.status || "Unknown",
            });
          }
          break;
        }
      }
    }

    // Cheerio fallback if ng-state was missing or empty
    if (results.length === 0) {
      const $ = cheerio.load(html);
      $("a[href*='/drama/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const slug = cleanSlug(href);
        if (!slug || results.some((r) => r.id === slug)) return;

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
          dramaInfo.title = b.name || b.originalName || slug;
          dramaInfo.image = b.image || b.coverImage || null;
          dramaInfo.image_url = dramaInfo.image;
          dramaInfo.description =
            b.description || b.synopsis || "";
          dramaInfo.genres = Array.isArray(b.genres) ? b.genres : [];
          dramaInfo.status = b.status || "Unknown";
          dramaInfo.aired = b.releaseYear ? String(b.releaseYear) : "";
          dramaInfo.country = b.country || "";

          if (Array.isArray(b.episodes)) {
            dramaInfo.totalEpisodes = b.episodes.length;
            dramaInfo.episodes = b.episodes.map((ep) => {
              const epNum = ep.number || 1;
              return {
                id: `${slug}/episode-${epNum}`,
                number: epNum,
                title: ep.title || `Episode ${epNum}`,
                thumbnail: dramaInfo.image,
                streamUrls: ep.streamUrls || [],
              };
            });
          }
          break;
        }
      }
    }

    // HTML DOM Fallback
    if (!dramaInfo.title || dramaInfo.episodes.length === 0) {
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
        $("a[href*='/episode-']").each((idx, el) => {
          const href = $(el).attr("href") || "";
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

    // 2. Add fallback providers from streamUrls (Vidmoly, Streamwish, Streamtape, Mixdrop)
    for (const s of streamUrls) {
      if (!s.url) continue;
      const url = s.url.trim();

      if (url.includes("vidmoly") && !sources.some((x) => x.url === url)) {
        sources.push({
          name: "DramaCool Vidmoly",
          quality: "1080p / 720p",
          url,
          isM3U8: false,
          headers: {
            Referer: `${baseUrl}/`,
          },
        });
      } else if (
        (url.includes("streamwish") || url.includes("hglink.to")) &&
        !sources.some((x) => x.url === url)
      ) {
        sources.push({
          name: "DramaCool Streamwish",
          quality: "720p (Streamwish)",
          url,
          isM3U8: false,
          headers: {
            Referer: `${baseUrl}/`,
          },
        });
      } else if (
        (url.includes("streamtape") || url.includes("watchadsontape")) &&
        !sources.some((x) => x.url === url)
      ) {
        sources.push({
          name: "DramaCool Streamtape",
          quality: "720p (Streamtape)",
          url,
          isM3U8: false,
          headers: {
            Referer: `${baseUrl}/`,
          },
        });
      } else if (
        url.includes("mixdrop") &&
        !sources.some((x) => x.url === url)
      ) {
        sources.push({
          name: "DramaCool Mixdrop",
          quality: "720p (Mixdrop)",
          url,
          isM3U8: false,
          headers: {
            Referer: `${baseUrl}/`,
          },
        });
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
  const pageNum = typeof page === "number" ? Math.max(1, page) : 1;

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
      return { results: [], hasNextPage: false, currentPage: pageNum };
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
                results.push({
                  id: d.slug,
                  title: d.name || d.normalizedName || d.slug,
                  image: d.image || d.coverImage || null,
                  type: "Drama",
                  subDub: "Sub",
                  releaseYear: d.releaseYear || "",
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
              results.push({
                id: d.slug,
                title: d.name || d.normalizedName || d.slug,
                image: d.image || d.coverImage || null,
                type: "Drama",
                subDub: "Sub",
                releaseYear: d.releaseYear || "",
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
      totalPages,
    };
  } catch (err) {
    return {
      results: [],
      hasNextPage: false,
      currentPage: pageNum,
    };
  }
}

module.exports = {
  name: "dramacool",
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
