/**
 * StrawVerse Extension - Re:ANIME Scraper
 * High-definition subbed and dubbed anime streaming with multi-server playback.
 * Based on https://reanime.cz/ (and https://reanime.to/)
 */

const baseUrl = "https://reanime.cz";

// Declarative header rules for Re:ANIME, Flixcloud and CDNs
const headerRules = [
  {
    match: ["reanime.cz", "reanime.to", "flixcloud.cc", "rundowncdn.top"],
    headers: {
      Referer: "https://reanime.cz/",
      Origin: "https://reanime.cz",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: ["flixcloud.cc", "rundowncdn.top"],
    headers: {
      Referer: "https://reanime.cz/",
      Origin: "https://reanime.cz",
    },
  },
];

const bypassDomains = [
  "reanime.cz",
  "reanime.to",
  "flixcloud.cc",
  "rundowncdn.top",
];

const _global =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof global !== "undefined"
    ? global
    : {};

// Resilient HTTP GET helper
async function httpGet(url, options = {}) {
  if (_global.axios) {
    try {
      return await _global.axios.get(url, options);
    } catch (err) {
      if (err.response) {
        return { data: err.response.data, status: err.response.status, headers: err.response.headers };
      }
      throw err;
    }
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/json,*/*",
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

// Universal pagination normalization
function normalizePage(arg) {
  if (typeof arg === "number" && Number.isFinite(arg)) {
    return Math.max(1, Math.min(500, Math.floor(arg)));
  }
  if (typeof arg === "string" && /^\d+$/.test(arg.trim())) {
    return Math.max(1, Math.min(500, parseInt(arg.trim(), 10)));
  }
  if (typeof arg === "object" && arg !== null) {
    if (typeof arg.page === "number" && Number.isFinite(arg.page)) {
      return Math.max(1, Math.min(500, Math.floor(arg.page)));
    }
    if (typeof arg.page === "string" && /^\d+$/.test(arg.page.trim())) {
      return Math.max(1, Math.min(500, parseInt(arg.page.trim(), 10)));
    }
    if (arg.filters && typeof arg.filters === "object") {
      return normalizePage(arg.filters);
    }
  }
  return 1;
}

// SvelteKit hydration data parser
function parseSvelteData(html) {
  if (!html || typeof html !== "string") return null;
  const match = html.match(/kit\.start\([^,]+,\s*[^,]+,\s*(\{[\s\S]*?\})\s*\);/);
  if (!match) return null;
  try {
    const fn = new Function("return " + match[1]);
    return fn();
  } catch (_) {
    return null;
  }
}

/**
 * Search anime across Re:ANIME catalog with pagination.
 */
async function SearchAnime(query, filters = {}) {
  const page = normalizePage(filters);
  const cleanQuery = typeof query === "string" ? query.trim() : String(query || "");

  if (!cleanQuery) {
    return { currentPage: 1, current_page: 1, page: 1, hasNextPage: false, totalPages: 1, results: [] };
  }

  try {
    const limit = 20;
    const offset = (page - 1) * limit;
    const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(cleanQuery)}&offset=${offset}`;

    const res = await httpGet(searchUrl, {
      headers: { Referer: `${baseUrl}/` },
      timeout: 9000,
    });

    const html = typeof res.data === "string" ? res.data : "";
    const parsed = parseSvelteData(html);
    const pageData = parsed?.data?.find((d) => d?.data?.initial);
    const rawResults = pageData?.data?.initial?.results || [];

    const results = rawResults.map((item) => {
      const title =
        item.title?.english ||
        item.title?.romaji ||
        item.title?.user_preferred ||
        item.title?.native ||
        "Unknown Title";

      const image =
        item.cover_image?.large ||
        item.cover_image?.extra_large ||
        item.cover_image?.medium ||
        null;

      const year = item.season_year ? String(item.season_year) : "";
      const rating = item.average_score ? (item.average_score / 10).toFixed(1) : null;

      return {
        id: item.anime_id,
        title,
        image,
        year,
        rating,
        status: item.status || "Unknown",
        episodes: item.episodes || 0,
        subDub: item.dubbed && item.subbed ? "Both" : item.dubbed ? "Dub" : "Sub",
      };
    });

    const hasNextPage = rawResults.length >= limit;
    const totalPages = hasNextPage ? page + 1 : page;

    return {
      currentPage: page,
      current_page: page,
      page: page,
      hasNextPage,
      totalPages,
      results,
    };
  } catch (err) {
    console.error("Re:ANIME search error:", err.message);
    return {
      currentPage: page,
      current_page: page,
      page: page,
      hasNextPage: false,
      totalPages: 1,
      results: [],
    };
  }
}

/**
 * Fetch latest aired anime episodes for home feed.
 */
async function fetchRecentEpisodes(filters = {}) {
  const page = normalizePage(filters);

  try {
    const res = await httpGet(`${baseUrl}/home`, {
      headers: { Referer: `${baseUrl}/` },
      timeout: 8000,
    });

    const html = typeof res.data === "string" ? res.data : "";
    const parsed = parseSvelteData(html);
    const pageData = parsed?.data?.find((d) => d?.data?.homeData);
    const latestAired = pageData?.data?.homeData?.latest_aired || [];

    const results = latestAired.map((item) => {
      const title =
        item.title?.english ||
        item.title?.romaji ||
        item.title?.user_preferred ||
        item.title?.native ||
        "Unknown Title";

      const image =
        item.cover_image?.large ||
        item.cover_image?.extra_large ||
        item.cover_image?.medium ||
        null;

      return {
        id: item.anime_id,
        title,
        image,
        episodes: item.episodes || 0,
        subDub: item.dubbed && item.subbed ? "Both" : item.dubbed ? "Dub" : "Sub",
      };
    });

    return {
      currentPage: page,
      current_page: page,
      page: page,
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    console.error("Re:ANIME fetchRecentEpisodes error:", err.message);
    return {
      currentPage: page,
      current_page: page,
      page: page,
      hasNextPage: false,
      totalPages: 1,
      results: [],
    };
  }
}

/**
 * Fetch detailed anime metadata and complete episode list.
 */
async function AnimeInfo(id) {
  const cleanId = String(id || "").trim();

  try {
    const watchUrl = `${baseUrl}/watch/${cleanId}`;
    const res = await httpGet(watchUrl, {
      headers: { Referer: `${baseUrl}/` },
      timeout: 9000,
    });

    const html = typeof res.data === "string" ? res.data : "";
    const parsed = parseSvelteData(html);
    const pageData = parsed?.data?.find((d) => d?.data?.anime);
    const anime = pageData?.data?.anime;

    if (!anime) {
      throw new Error(`Failed to extract anime data for ${cleanId}`);
    }

    const title =
      anime.title?.english ||
      anime.title?.romaji ||
      anime.title?.user_preferred ||
      anime.title?.native ||
      cleanId;

    const poster =
      anime.cover_image?.large ||
      anime.cover_image?.extra_large ||
      anime.banner_image ||
      null;

    const anilistId = anime.anilist_id || 0;
    const malId = anime.mal_id || 0;
    const episodes = [];

    // Fetch episode rows via Re:ANIME API
    try {
      const epApiUrl = `${baseUrl}/api/v1/anime/${encodeURIComponent(cleanId)}/episodes?limit=100&offset=0`;
      const epRes = await httpGet(epApiUrl, {
        headers: { Referer: `${baseUrl}/watch/${cleanId}` },
        timeout: 8000,
      });

      if (epRes.status === 200 && epRes.data && Array.isArray(epRes.data.data)) {
        const total = epRes.data.total || epRes.data.data.length;

        for (const ep of epRes.data.data) {
          const epNum = ep.episode_number || 1;
          episodes.push({
            id: `${cleanId}:${epNum}:${anilistId}:${malId}`,
            number: epNum,
            episode: epNum,
            title: ep.title ? `Episode ${epNum} - ${ep.title}` : `Episode ${epNum}`,
            thumbnail: ep.thumbnail || null,
          });
        }

        // If there are more than 100 episodes, fetch remaining batches
        if (total > 100) {
          const remainingChunks = Math.ceil((total - 100) / 100);
          for (let chunk = 1; chunk <= remainingChunks; chunk++) {
            const nextOffset = chunk * 100;
            const nextUrl = `${baseUrl}/api/v1/anime/${encodeURIComponent(cleanId)}/episodes?limit=100&offset=${nextOffset}`;
            const nextRes = await httpGet(nextUrl, {
              headers: { Referer: `${baseUrl}/watch/${cleanId}` },
              timeout: 6000,
            });
            if (nextRes.status === 200 && nextRes.data && Array.isArray(nextRes.data.data)) {
              for (const ep of nextRes.data.data) {
                const epNum = ep.episode_number || 1;
                episodes.push({
                  id: `${cleanId}:${epNum}:${anilistId}:${malId}`,
                  number: epNum,
                  episode: epNum,
                  title: ep.title ? `Episode ${epNum} - ${ep.title}` : `Episode ${epNum}`,
                  thumbnail: ep.thumbnail || null,
                });
              }
            }
          }
        }
      }
    } catch (epErr) {
      console.warn("Episode API error, falling back to count:", epErr.message);
    }

    // Fallback if episode endpoint didn't populate
    if (episodes.length === 0) {
      const totalCount = anime.episodes_total || anime.episodes || 1;
      for (let i = 1; i <= totalCount; i++) {
        episodes.push({
          id: `${cleanId}:${i}:${anilistId}:${malId}`,
          number: i,
          episode: i,
          title: `Episode ${i}`,
        });
      }
    }

    return {
      id: cleanId,
      dataId: cleanId,
      title,
      image: poster,
      description: (anime.description || "").replace(/<[^>]+>/g, "").trim(),
      genres: Array.isArray(anime.genres) ? anime.genres : [],
      status: anime.status || "Unknown",
      totalEpisodes: episodes.length,
      episodes,
    };
  } catch (err) {
    console.error("Re:ANIME AnimeInfo error:", err.message);
    throw err;
  }
}

/**
 * Fetch episode list wrapper for StrawVerse pagination.
 */
async function fetchEpisode(id, page = 1) {
  try {
    const info = await AnimeInfo(id);
    return {
      TotalPages: 1,
      total: info.episodes.length,
      episodes: info.episodes,
    };
  } catch (err) {
    console.error("Re:ANIME fetchEpisode error:", err.message);
    return { TotalPages: 1, total: 0, episodes: [] };
  }
}

/**
 * Stream & Subtitle Extraction Engine.
 * Fetches Flixcloud video streaming servers and embedded subtitle tracks.
 */
async function fetchEpisodeSources(episodeId, category = null) {
  const sources = [];
  const subtitles = [];

  let animeId = "";
  let epNum = 1;
  let anilistId = 0;
  let malId = 0;

  const parts = String(episodeId || "").split(":");
  if (parts.length >= 2) {
    animeId = parts[0];
    epNum = parseInt(parts[1], 10) || 1;
    anilistId = parseInt(parts[2], 10) || 0;
    malId = parseInt(parts[3], 10) || 0;
  } else {
    animeId = String(episodeId || "").trim();
  }

  // If anilistId was not embedded in episodeId, fetch AnimeInfo to retrieve it
  if (!anilistId) {
    try {
      const info = await AnimeInfo(animeId);
      if (info && info.episodes && info.episodes[0]) {
        const epParts = info.episodes[0].id.split(":");
        anilistId = parseInt(epParts[2], 10) || 0;
        malId = parseInt(epParts[3], 10) || 0;
      }
    } catch (_) {}
  }

  if (!anilistId) {
    return { sources, subtitles };
  }

  // Register stream headers for StrawVerse player
  if (typeof _global.registerStreamHeaders === "function") {
    _global.registerStreamHeaders("flixcloud.cc", {
      Referer: "https://reanime.cz/",
      Origin: "https://reanime.cz",
    });
    _global.registerStreamHeaders("rundowncdn.top", {
      Referer: "https://flixcloud.cc/",
      Origin: "https://flixcloud.cc",
    });
  }

  try {
    const flixUrl = `${baseUrl}/api/flix/${anilistId}/${epNum}${malId ? `?mal=${malId}` : ""}`;
    const flixRes = await httpGet(flixUrl, {
      headers: { Referer: `${baseUrl}/watch/${animeId}` },
      timeout: 8000,
    });

    if (flixRes.status === 200 && flixRes.data && Array.isArray(flixRes.data.servers)) {
      for (const server of flixRes.data.servers) {
        if (!server.dataLink) continue;

        const serverLabel = server.serverName || "HD";
        const typeLabel = server.dataType ? `(${server.dataType.toUpperCase()})` : "";
        const hardsubLabel = server.hardsub ? "(Hardsub)" : "";

        sources.push({
          name: `Re:ANIME ${serverLabel} ${typeLabel} ${hardsubLabel}`.trim(),
          quality: "1080p / 720p (Flixcloud)",
          url: server.dataLink,
          isM3U8: false,
          headers: {
            Referer: "https://reanime.cz/",
            Origin: "https://reanime.cz",
          },
        });
      }

      // Extract subtitle tracks from the first available embed server
      const firstServer = flixRes.data.servers[0];
      if (firstServer && firstServer.dataLink) {
        try {
          const embedRes = await httpGet(firstServer.dataLink, {
            headers: { Referer: "https://reanime.cz/" },
            timeout: 6000,
          });

          const embedHtml = typeof embedRes.data === "string" ? embedRes.data : "";
          const subMatch = embedHtml.match(/subtitles:\s*(\[[^\]]+\])/);
          if (subMatch && subMatch[1]) {
            const subs = new Function("return " + subMatch[1])();
            if (Array.isArray(subs)) {
              for (const s of subs) {
                if (s.url) {
                  subtitles.push({
                    url: s.url,
                    lang: s.language || "English",
                    default: !!s.default,
                  });
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error("Re:ANIME fetchEpisodeSources error:", err.message);
  }

  return { sources, subtitles };
}

module.exports = {
  name: "reanime",
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
