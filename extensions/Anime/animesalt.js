/**
 * StrawVerse Extension - AnimeSalt Scraper
 * Specializing in Multi-Language Dubbed & Subbed Anime (Hindi, Tamil, Telugu, Malayalam, English, Japanese)
 * Based on https://animesalt.ro/ and StrawVerse Extension Specification.
 */

const cheerio = require("cheerio");
const crypto = require("crypto");

const baseUrl = "https://animesalt.ro";

// Declarative header rules for AnimeSalt, NekoMux player and CDN servers
const headerRules = [
  {
    match: ["animesalt", "nekomux", "play.nekomux", "abyss", "abysscdn", "abyssplayer"],
    headers: {
      Referer: "https://animesalt.ro/",
      Origin: "https://animesalt.ro",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: ["nekomux", "play.nekomux", "abyss", "abysscdn", "abyssplayer", "sssrr.org"],
    headers: {
      Referer: "https://player.nekomux.com/",
      Origin: "https://player.nekomux.com",
    },
  },
];

const bypassDomains = [
  "animesalt.ro",
  "nekomux.com",
  "play.nekomux.com",
  "abysscdn.com",
  "abyssplayer.com",
];

// Resilient HTTP request helper (uses global.axios if available, falls back to native fetch)
async function httpGet(url, options = {}) {
  if (global.axios) {
    try {
      return await global.axios.get(url, options);
    } catch (err) {
      // If global.axios fails, fall through to fetch
    }
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(options.headers || {}),
  };
  const timeoutMs = options.timeout || 12000;
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
    .replace(/^https?:\/\/[^\/]+\/anime\//i, "")
    .replace(/^https?:\/\/[^\/]+\//i, "")
    .replace(/^\/?anime\//i, "")
    .replace(/^\/+|\/+$/g, "");
}

/**
 * Parse standard WordPress pagination controls.
 * @param {object} $ - Cheerio root
 * @param {number} currentPage
 * @returns {{ currentPage: number, hasNextPage: boolean, totalPages: number }}
 */
function parsePagination($, currentPage) {
  let totalPages = currentPage;
  let hasNextPage = false;

  const nextEl = $(
    "a.next.page-numbers, a.next, .pagination .next, .nav-links .next",
  );
  if (nextEl.length > 0) {
    hasNextPage = true;
  }

  $("a.page-numbers, span.page-numbers").each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > totalPages) {
      totalPages = num;
    }
  });

  return {
    currentPage,
    hasNextPage: hasNextPage || totalPages > currentPage,
    totalPages,
  };
}

/**
 * Search for anime on AnimeSalt.
 * @param {string} query
 * @param {number|object} [page=1]
 * @returns {Promise<{ currentPage: number, hasNextPage: boolean, totalPages: number, results: Array<{ id: string, title: string, image: string, type: string, subDub: string }> }>}
 */
async function SearchAnime(query, page = 1) {
  try {
    const pageNum = normalizePage(page);
    const searchUrl =
      pageNum > 1
        ? `${baseUrl}/page/${pageNum}/?s=${encodeURIComponent(query)}`
        : `${baseUrl}/?s=${encodeURIComponent(query)}`;

    const res = await httpGet(searchUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) {
      return {
        currentPage: pageNum,
        hasNextPage: false,
        totalPages: 0,
        results: [],
      };
    }

    const $ = cheerio.load(html);
    const results = [];

    $("article.bs").each((_, el) => {
      const aTag = $(el).find(".bsx a.tip, .bsx a");
      const href = aTag.attr("href") || "";
      const slug = cleanSlug(href);
      if (!slug) return;

      const title =
        aTag.attr("title") ||
        $(el).find(".tt h2").first().text().trim() ||
        $(el).find(".tt").first().text().trim() ||
        slug;

      const imgTag = $(el).find("img");
      const image =
        imgTag.attr("src") ||
        imgTag.attr("data-src") ||
        imgTag.attr("data-lazy-src") ||
        null;

      const type = $(el).find(".typez").text().trim() || "TV";
      const subDub = $(el).find(".sb").text().trim() || "Dub";

      results.push({
        id: slug,
        title,
        image,
        type,
        subDub,
      });
    });

    const pagination = parsePagination($, pageNum);

    return {
      currentPage: pagination.currentPage,
      current_page: pagination.currentPage,
      page: pagination.currentPage,
      hasNextPage: pagination.hasNextPage,
      totalPages: pagination.totalPages,
      results,
    };
  } catch (err) {
    console.error("AnimeSalt SearchAnime error:", err.message);
    const pNum = normalizePage(page);
    return {
      currentPage: pNum,
      current_page: pNum,
      page: pNum,
      hasNextPage: false,
      totalPages: 0,
      results: [],
    };
  }
}

/**
 * Fetch detailed anime metadata and complete episode list.
 * @param {string} id - Anime slug or URL
 * @returns {Promise<{ id: string, title: string, image: string, description: string, genres: Array<string>, status: string, type: string, totalEpisodes: number, episodes: Array<{ id: string, number: number, title: string, thumbnail?: string }> }>}
 */
async function AnimeInfo(id) {
  const slug = cleanSlug(id);
  const animeInfo = {
    id: slug,
    title: "",
    image: null,
    image_url: null,
    description: "",
    genres: [],
    status: "Unknown",
    type: "TV",
    aired: "",
    totalEpisodes: 0,
    episodes: [],
  };

  try {
    const url = `${baseUrl}/anime/${slug}/`;
    const res = await httpGet(url, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return animeInfo;

    const $ = cheerio.load(html);

    animeInfo.title =
      $("h1.entry-title").text().trim() ||
      $('h1[itemprop="headline"]').text().trim() ||
      $('h1[itemprop="name"]').text().trim() ||
      $(".infox h1").text().trim() ||
      slug;

    const imgTag = $(".thumb img.wp-post-image, .thumb img, .poster img").first();
    animeInfo.image =
      imgTag.attr("src") ||
      imgTag.attr("data-src") ||
      imgTag.attr("data-lazy-src") ||
      null;
    animeInfo.image_url = animeInfo.image;

    animeInfo.description =
      $(".entry-content[itemprop='description']").text().trim() ||
      $(".entry-content").first().text().trim() ||
      $(".synopsis").text().trim() ||
      "";

    const genres = [];
    $(".genxed:not(.langxed) a, .spe span:contains('Genre') a").each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });
    animeInfo.genres = genres;

    const statusEl = $("span:contains('Status:')").first().text().replace(/Status:/i, "").trim();
    if (statusEl.toLowerCase().includes("completed") || statusEl.toLowerCase().includes("ended")) {
      animeInfo.status = "Completed";
    } else if (statusEl.toLowerCase().includes("ongoing") || statusEl.toLowerCase().includes("returning")) {
      animeInfo.status = "Ongoing";
    } else if (statusEl) {
      animeInfo.status = statusEl;
    }

    const airedEl =
      $("span:contains('Released:')").first().text().replace(/Released:/i, "").trim() ||
      $("span:contains('Aired:')").first().text().replace(/Aired:/i, "").trim();
    animeInfo.aired = airedEl || "";

    const languages = [];
    $(".genxed.langxed a, .langxed a").each((_, el) => {
      const l = $(el).text().trim();
      if (l && !languages.includes(l)) languages.push(l);
    });
    animeInfo.languages = languages;

    const typeText =
      $(".typez").first().text().trim() ||
      $(".spe span:contains('Type')").text().trim();
    if (typeText) {
      animeInfo.type = typeText.includes("Movie") ? "Movie" : "TV";
    }

    // 1. Primary: AnimeStream Child Season Cards (.asc-epcard)
    const episodes = [];
    $("a.asc-epcard").each((idx, el) => {
      const href = $(el).attr("href") || "";
      const epSlug = cleanSlug(href);
      if (!epSlug) return;

      const numText = $(el).find(".asc-epnum").text().trim();
      const epNum = parseFloat(numText) || idx + 1;
      const epTitle =
        $(el).find(".asc-eptitle").attr("title") ||
        $(el).find(".asc-eptitle").text().trim() ||
        `Episode ${epNum}`;

      const thumbImg = $(el).find(".asc-epthumb img");
      const thumbnail =
        thumbImg.attr("src") ||
        thumbImg.attr("data-src") ||
        thumbImg.attr("data-lazy-src") ||
        null;

      episodes.push({
        id: epSlug,
        number: epNum,
        title: epTitle,
        thumbnail,
      });
    });

    // 2. Secondary fallback: traditional WordPress episode lists (.eplister li a)
    if (episodes.length === 0) {
      $(".eplister li a, .episodelist ul li a").each((idx, el) => {
        const href = $(el).attr("href") || "";
        const epSlug = cleanSlug(href);
        if (!epSlug) return;

        const epNumText = $(el).find(".epl-num").text().trim();
        const epNum = parseFloat(epNumText) || idx + 1;
        const epTitle =
          $(el).find(".epl-title").text().trim() || `Episode ${epNum}`;

        episodes.push({
          id: epSlug,
          number: epNum,
          title: epTitle,
        });
      });
    }

    // 3. Fallback for single movies or entries with no separate card
    if (episodes.length === 0) {
      episodes.push({
        id: slug,
        number: 1,
        title: animeInfo.title || "Full Movie",
        thumbnail: animeInfo.image,
      });
    }

    animeInfo.episodes = episodes;
    animeInfo.totalEpisodes = episodes.length;
    return animeInfo;
  } catch (err) {
    console.error("AnimeSalt AnimeInfo error:", err.message);
    return animeInfo;
  }
}

/**
 * Fetch episode list for StrawVerse navigation.
 * @param {string} id - Anime slug
 * @param {number} [page=1]
 * @returns {Promise<{ episodes: Array<object>, totalPages: number, total: number, currentPage: number }>}
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
    console.error("AnimeSalt fetchEpisode error:", err.message);
    return { episodes: [], totalPages: 0, total: 0, currentPage: page };
  }
}

/**
 * Resolve NekoMux player embed into master HLS stream.
 * @param {string} embedUrl
 * @returns {Promise<string|null>}
 */
async function resolveNekomuxStream(embedUrl) {
  try {
    const match = embedUrl.match(/episode\/(\d+)/);
    if (!match) return null;
    const epNum = match[1];

    const sourceApi = `https://player.nekomux.com/episode/${epNum}/source`;
    const res = await httpGet(sourceApi, {
      headers: {
        Referer: `https://player.nekomux.com/episode/${epNum}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 8000,
    });

    const data = res.data;
    if (data && data.ok && data.url) {
      return data.url;
    }
  } catch (err) {
    console.warn("NekoMux stream resolution notice:", err.message);
  }
  return null;
}

/**
 * Fetch video sources and subtitles for a specific episode.
 * Exposes multi-language dubbed servers (Hindi default, Tamil, Telugu, Malayalam, English, Japanese).
 * @param {string} episodeId
 * @param {string} [category=null]
 * @returns {Promise<{ sources: Array<{ name: string, quality: string, url: string, isM3U8: boolean, headers?: object, lang?: string, type?: string, isDub?: boolean }>, subtitles: Array<{ url: string, lang: string }> }>}
 */
async function fetchEpisodeSources(episodeId, category = null) {
  try {
    const epSlug = cleanSlug(episodeId);
    const episodeUrl = `${baseUrl}/${epSlug}/`;

    const res = await httpGet(episodeUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return { sources: [], subtitles: [] };

    const $ = cheerio.load(html);
    const sources = [];
    const subtitles = [];

    // Register stream headers dynamically
    if (typeof global.registerStreamHeaders === "function") {
      global.registerStreamHeaders("player.nekomux.com", {
        Referer: "https://player.nekomux.com/",
        Origin: "https://player.nekomux.com",
      });
      global.registerStreamHeaders("play.nekomux.com", {
        Referer: "https://player.nekomux.com/",
        Origin: "https://player.nekomux.com",
      });
      global.registerStreamHeaders("animesalt.ro", {
        Referer: "https://animesalt.ro/",
      });
    }

    if (typeof global.registerSubrequestHeaders === "function") {
      global.registerSubrequestHeaders("play.nekomux.com", {
        Referer: "https://player.nekomux.com/",
        Origin: "https://player.nekomux.com",
      });
    }

    // Parse all server buttons with loadMi({ value: '<BASE64_IFRAME>' })
    const serverButtons = [];
    $("button.server-button").each((_, el) => {
      const title = $(el).find(".server-button-title").text().trim() || "Server";
      const onclick = $(el).attr("onclick") || "";
      const b64Match = onclick.match(/value:\s*['"]([A-Za-z0-9+/=]+)['"]/);
      if (b64Match) {
        try {
          const iframeHtml = Buffer.from(b64Match[1], "base64").toString("latin1");
          const urlMatch =
            iframeHtml.match(/url=([^"&\s]+)/i) ||
            iframeHtml.match(/src="([^"]+)"/i);
          const targetUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : "";
          if (targetUrl) {
            serverButtons.push({ title, url: targetUrl });
          }
        } catch (_) {}
      }
    });

    // 1. Look for NekoMux multi-audio server first (provides master HLS with Hindi default audio)
    for (const btn of serverButtons) {
      if (btn.url.includes("player.nekomux.com/episode/")) {
        const hlsUrl = await resolveNekomuxStream(btn.url);
        if (hlsUrl) {
          sources.push({
            name: "AnimeSalt NekoMux (Multi-Audio: Hindi / Tamil / Telugu / Eng)",
            quality: "1080p (Multi-Audio HLS - Hindi Default)",
            url: hlsUrl,
            isM3U8: true,
            headers: {
              Referer: "https://player.nekomux.com/",
              Origin: "https://player.nekomux.com",
            },
            lang: "dub",
            type: "dub",
            isDub: true,
          });
          break; // First working NekoMux stream is the complete multi-audio master
        }
      }
    }

    // 2. Parse language options from Abyss multilang data or individual buttons
    for (const btn of serverButtons) {
      if (btn.url.includes("multilang.php?data=")) {
        try {
          const dataMatch = btn.url.match(/data=([A-Za-z0-9+/=]+)/);
          if (dataMatch) {
            const jsonStr = Buffer.from(dataMatch[1], "base64").toString("latin1");
            const langList = JSON.parse(jsonStr);
            if (Array.isArray(langList)) {
              for (const item of langList) {
                const langName = item.language || "Multi";
                const linkId = item.link;
                if (linkId) {
                  const playerUrl = `https://abyssplayer.com/${linkId}`;
                  sources.push({
                    name: `AnimeSalt Abyss (${langName} Dub)`,
                    quality: `${langName} (Abyss WebPlayer)`,
                    url: playerUrl,
                    isM3U8: false,
                    headers: {
                      Referer: "https://animesalt.ro/",
                    },
                    lang: "dub",
                    type: "dub",
                    isDub: true,
                  });
                }
              }
            }
          }
        } catch (_) {}
      } else if (btn.url.includes("abysscdn.com/?v=")) {
        const vMatch = btn.url.match(/v=([A-Za-z0-9_-]+)/);
        if (vMatch) {
          const linkId = vMatch[1];
          const langName = btn.title || "Dub";
          const playerUrl = `https://abyssplayer.com/${linkId}`;
          const isAlreadyAdded = sources.some((s) => s.url === playerUrl);
          if (!isAlreadyAdded) {
            sources.push({
              name: `AnimeSalt (${langName})`,
              quality: `${langName} (Abyss Player)`,
              url: playerUrl,
              isM3U8: false,
              headers: {
                Referer: "https://animesalt.ro/",
              },
              lang: langName.toLowerCase().includes("sub") ? "sub" : "dub",
              type: langName.toLowerCase().includes("sub") ? "sub" : "dub",
              isDub: !langName.toLowerCase().includes("sub"),
            });
          }
        }
      }
    }

    // Sort: Multi-Audio HLS first, then Hindi Dub, then other dubs, then subs
    sources.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const score = (name, isM3u8) => {
        if (isM3u8) return 100;
        if (name.includes("hindi")) return 80;
        if (name.includes("multi")) return 70;
        if (name.includes("tamil")) return 60;
        if (name.includes("telugu")) return 50;
        if (name.includes("english")) return 40;
        return 10;
      };
      return score(bName, b.isM3U8) - score(aName, a.isM3U8);
    });

    return {
      sources,
      subtitles,
    };
  } catch (err) {
    console.error("AnimeSalt fetchEpisodeSources error:", err.message);
    return { sources: [], subtitles: [] };
  }
}

/**
 * Fetch latest releases for catalog and home screen.
 * @param {number|object} [page=1]
 * @returns {Promise<{ currentPage: number, hasNextPage: boolean, totalPages: number, results: Array<{ id: string, title: string, episode: number, image: string, type?: string, subDub?: string }> }>}
 */
async function fetchRecentEpisodes(page = 1) {
  try {
    const pageNum = normalizePage(page);
    const url =
      pageNum > 1
        ? `${baseUrl}/anime/page/${pageNum}/?order=update`
        : `${baseUrl}/anime/?order=update`;

    const res = await httpGet(url, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    if (!html) {
      return {
        currentPage: pageNum,
        hasNextPage: false,
        totalPages: 0,
        results: [],
      };
    }

    const $ = cheerio.load(html);
    const results = [];

    $("article.bs").each((_, el) => {
      const aTag = $(el).find(".bsx a.tip, .bsx a");
      const href = aTag.attr("href") || "";
      const slug = cleanSlug(href);
      if (!slug) return;

      const title =
        aTag.attr("title") ||
        $(el).find(".tt h2").first().text().trim() ||
        $(el).find(".tt").first().text().trim() ||
        slug;

      const imgTag = $(el).find("img");
      const image =
        imgTag.attr("src") ||
        imgTag.attr("data-src") ||
        imgTag.attr("data-lazy-src") ||
        null;

      const epText = $(el).find(".epx").text().trim();
      const epNum = parseFloat(epText.replace(/[^0-9.]/g, "")) || 1;
      const type = $(el).find(".typez").text().trim() || "TV";
      const subDub = $(el).find(".sb").text().trim() || "Dub";

      results.push({
        id: slug,
        title,
        episode: epNum,
        image,
        type,
        subDub,
      });
    });

    const pagination = parsePagination($, pageNum);

    return {
      currentPage: pagination.currentPage,
      current_page: pagination.currentPage,
      page: pagination.currentPage,
      hasNextPage: pagination.hasNextPage,
      totalPages: pagination.totalPages,
      results,
    };
  } catch (err) {
    console.error("AnimeSalt fetchRecentEpisodes error:", err.message);
    const pNum = normalizePage(page);
    return {
      currentPage: pNum,
      current_page: pNum,
      page: pNum,
      hasNextPage: false,
      totalPages: 0,
      results: [],
    };
  }
}

module.exports = {
  name: "animesalt",
  version: "1.0.2",
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
