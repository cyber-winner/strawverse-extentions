/**
 * StrawVerse Extension - Bingr Movie & TV Show Scraper
 * Multi-domain streaming scraper supporting all Bingr mirrors (bingr.one, bingr.st, etc.)
 * with high-speed HLS stream extraction and dynamic domain fallback.
 */

const primaryBaseUrl = "https://bingr.one";

// Known mirror domains for automatic failover and load balancing
const BINGR_MIRRORS = [
  "https://bingr.one",
  "https://bingr.st",
  "https://bingr.fans",
];

const API_ENDPOINTS = [
  "https://api.bingr.st/api",
  "https://bingr.one/api",
  "https://bingr.st/api",
];

// Fallback TMDB catalog access if direct mirror API undergoes maintenance
const tmdbApiKey = "8476a7ab80ad76f0936744df0430e67c";
const tmdbBase = "https://api.themoviedb.org/3";
const imageBase = "https://image.tmdb.org/t/p";

// Declarative header rules for Bingr and media hosts
const headerRules = [
  {
    match: ["bingr", "vidrift", "rousav", "hakunaymatata", "vidly", "vidbolt", "cinezo", "vidy"],
    headers: {
      Referer: "https://bingr.one/",
      Origin: "https://bingr.one",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  },
];

const subrequestHeaders = [
  {
    match: ["vidrift", "rousav", "hakunaymatata"],
    headers: {
      Referer: "https://embed.vidrift.in/",
      Origin: "https://embed.vidrift.in",
    },
  },
  {
    match: ["vidly"],
    headers: {
      Referer: "https://vidly.pro/",
      Origin: "https://vidly.pro",
    },
  },
];

const bypassDomains = [
  "bingr.one",
  "bingr.st",
  "api.bingr.st",
  "vidrift.in",
  "rousav.tech",
  "hakunaymatata.com",
  "vidly.pro",
  "vidbolt.xyz",
  "cinezo.live",
  "vidy.st",
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

  const headers = options.headers || {};
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

// Cached active API domain with periodic health check (5-minute TTL)
let cachedActiveApi = "https://api.bingr.st/api";
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getFastestApiBase() {
  const now = Date.now();
  if (cachedActiveApi && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedActiveApi;
  }

  for (const base of API_ENDPOINTS) {
    try {
      const res = await httpGet(`${base}/trending/all?page=1`, {
        headers: { Referer: "https://bingr.one/" },
        timeout: 4000,
      });
      if (res && res.status === 200 && res.data?.results) {
        cachedActiveApi = base;
        cacheTimestamp = now;
        return base;
      }
    } catch (_) {}
  }

  // Default fallback if all candidates time out
  return cachedActiveApi || "https://api.bingr.st/api";
}

/**
 * Search movies and TV shows across Bingr catalog.
 * Supports keyword search with pagination.
 */
async function SearchAnime(query, filters = {}) {
  const page = normalizePage(filters);
  const cleanQuery = typeof query === "string" ? query.trim() : String(query || "");

  if (!cleanQuery) {
    return { currentPage: 1, current_page: 1, page: 1, hasNextPage: false, totalPages: 1, results: [] };
  }

  try {
    const apiBase = await getFastestApiBase();
    const searchUrl = `${apiBase}/search?q=${encodeURIComponent(cleanQuery)}&page=${page}`;
    const res = await httpGet(searchUrl, {
      headers: { Referer: "https://bingr.one/" },
      timeout: 8000,
    });

    if (res && res.status === 200 && res.data && Array.isArray(res.data.results)) {
      const results = res.data.results
        .filter((item) => item.type === "movie" || item.type === "tv")
        .map((item) => {
          const type = item.type || "movie";
          const image = item.poster || (item.backdrop ? `${imageBase}/w500${item.backdrop}` : null);
          return {
            id: `${type}:${item.id}`,
            title: item.title || "Unknown Title",
            image: image || null,
            year: item.year ? String(item.year) : "",
            rating: item.rating ? String(item.rating) : null,
            type: type === "tv" ? "TV Series" : "Movie",
          };
        });

      const totalPages = Math.min(res.data.total_pages || 1, 500);

      return {
        currentPage: page,
        current_page: page,
        page: page,
        hasNextPage: page < totalPages,
        totalPages,
        results,
      };
    }
  } catch (apiErr) {
    console.warn("Bingr API search warning, checking fallback:", apiErr.message);
  }

  // Resilient fallback to TMDB search catalog
  try {
    const fallbackUrl = `${tmdbBase}/search/multi?query=${encodeURIComponent(
      cleanQuery
    )}&page=${page}&include_adult=false&api_key=${tmdbApiKey}`;
    const res = await httpGet(fallbackUrl, {
      headers: { Referer: "https://bingr.one/" },
      timeout: 8000,
    });

    const results = (res.data?.results || [])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .map((item) => {
        const isMovie = item.media_type === "movie";
        const title = isMovie ? item.title : item.name;
        const releaseDate = isMovie ? item.release_date : item.first_air_date;
        const year = releaseDate ? releaseDate.split("-")[0] : "";
        const image = item.poster_path ? `${imageBase}/w500${item.poster_path}` : null;

        return {
          id: `${item.media_type}:${item.id}`,
          title: title || "Unknown Title",
          image: image || null,
          year,
          rating: item.vote_average ? item.vote_average.toFixed(1) : null,
          type: item.media_type === "tv" ? "TV Series" : "Movie",
        };
      });

    const totalPages = Math.min(res.data?.total_pages || 1, 500);
    return {
      currentPage: page,
      current_page: page,
      page: page,
      hasNextPage: page < totalPages,
      totalPages,
      results,
    };
  } catch (fallbackErr) {
    console.error("Bingr search error:", fallbackErr.message);
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
 * Fetch latest trending and popular releases for the home feed.
 */
async function fetchRecentEpisodes(filters = {}) {
  const page = normalizePage(filters);

  try {
    const apiBase = await getFastestApiBase();
    const trendingUrl = `${apiBase}/trending/all?page=${page}`;
    const res = await httpGet(trendingUrl, {
      headers: { Referer: "https://bingr.one/" },
      timeout: 8000,
    });

    if (res && res.status === 200 && res.data && Array.isArray(res.data.results)) {
      const results = res.data.results
        .filter((item) => item.type === "movie" || item.type === "tv")
        .map((item) => {
          const type = item.type || "movie";
          const image = item.poster || (item.backdrop ? `${imageBase}/w500${item.backdrop}` : null);
          return {
            id: `${type}:${item.id}`,
            title: item.title || "Unknown Title",
            image: image || null,
            year: item.year ? String(item.year) : "",
            rating: item.rating ? String(item.rating) : null,
            type: type === "tv" ? "TV Series" : "Movie",
          };
        });

      const totalPages = Math.min(res.data.total_pages || 1, 500);
      return {
        currentPage: page,
        current_page: page,
        page: page,
        hasNextPage: page < totalPages,
        totalPages,
        results,
      };
    }
  } catch (apiErr) {
    console.warn("Bingr API trending warning, using fallback:", apiErr.message);
  }

  // Fallback to TMDB trending
  try {
    const fallbackUrl = `${tmdbBase}/trending/all/day?page=${page}&api_key=${tmdbApiKey}`;
    const res = await httpGet(fallbackUrl, {
      headers: { Referer: "https://bingr.one/" },
      timeout: 8000,
    });

    const results = (res.data?.results || [])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .map((item) => {
        const isMovie = item.media_type === "movie";
        const title = isMovie ? item.title : item.name;
        const image = item.poster_path ? `${imageBase}/w500${item.poster_path}` : null;
        return {
          id: `${item.media_type || "movie"}:${item.id}`,
          title: title || "Unknown Title",
          image: image || null,
        };
      });

    const totalPages = Math.min(res.data?.total_pages || 1, 500);
    return {
      currentPage: page,
      current_page: page,
      page: page,
      hasNextPage: page < totalPages,
      totalPages,
      results,
    };
  } catch (err) {
    console.error("Bingr fetchRecentEpisodes error:", err.message);
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
 * Fetch detailed metadata and complete episode list for a title.
 */
async function AnimeInfo(id) {
  let type = "movie";
  let tmdbId = String(id).trim();

  if (tmdbId.includes(":")) {
    const parts = tmdbId.split(":");
    type = parts[0] === "tv" ? "tv" : "movie";
    tmdbId = parts[1];
  }

  try {
    const apiBase = await getFastestApiBase();
    const detailsUrl = `${apiBase}/details/${type}/${tmdbId}`;
    const res = await httpGet(detailsUrl, {
      headers: { Referer: "https://bingr.one/" },
      timeout: 8000,
    });

    if (res && res.status === 200 && res.data) {
      const data = res.data;
      const title = data.title || "Unknown Title";
      const poster = data.poster || data.backdrop || null;
      const description = data.overview || "";
      const genres = Array.isArray(data.genres) ? data.genres : [];
      const episodes = [];

      if (type === "movie") {
        episodes.push({
          id: `movie:${tmdbId}:1:1`,
          number: 1,
          episode: 1,
          title: title,
        });
      } else if (Array.isArray(data.seasons)) {
        // Fetch detailed episodes for each season
        for (const seasonObj of data.seasons) {
          const seasonNum = seasonObj.season || 1;
          const totalEps = seasonObj.episodes || 1;

          try {
            const epRes = await httpGet(`${apiBase}/episodes/${tmdbId}/${seasonNum}`, {
              headers: { Referer: "https://bingr.one/" },
              timeout: 6000,
            });

            if (epRes && epRes.status === 200 && epRes.data && Array.isArray(epRes.data.episodes)) {
              for (const ep of epRes.data.episodes) {
                const epNum = ep.episode || 1;
                episodes.push({
                  id: `tv:${tmdbId}:${seasonNum}:${epNum}`,
                  number: epNum,
                  season: seasonNum,
                  episode: epNum,
                  title: ep.title ? `S${seasonNum} E${epNum} - ${ep.title}` : `Season ${seasonNum} Episode ${epNum}`,
                });
              }
            } else {
              // Season fallback enumeration
              for (let ep = 1; ep <= totalEps; ep++) {
                episodes.push({
                  id: `tv:${tmdbId}:${seasonNum}:${ep}`,
                  number: ep,
                  season: seasonNum,
                  episode: ep,
                  title: `Season ${seasonNum} Episode ${ep}`,
                });
              }
            }
          } catch (_) {
            for (let ep = 1; ep <= totalEps; ep++) {
              episodes.push({
                id: `tv:${tmdbId}:${seasonNum}:${ep}`,
                number: ep,
                season: seasonNum,
                episode: ep,
                title: `Season ${seasonNum} Episode ${ep}`,
              });
            }
          }
        }
      }

      return {
        id: `${type}:${tmdbId}`,
        dataId: `${type}:${tmdbId}`,
        title,
        image: poster,
        description,
        genres,
        status: data.status || "Completed",
        totalEpisodes: episodes.length,
        episodes,
      };
    }
  } catch (apiErr) {
    console.warn("Bingr details API notice, using TMDB fallback:", apiErr.message);
  }

  // Fallback to TMDB details
  const appendParams =
    type === "tv"
      ? "content_ratings,images,credits,seasons,external_ids"
      : "release_dates,images,credits,videos,external_ids";
  const url = `${tmdbBase}/${type}/${tmdbId}?append_to_response=${appendParams}&api_key=${tmdbApiKey}`;
  const { data } = await httpGet(url, {
    headers: { Referer: "https://bingr.one/" },
    timeout: 8000,
  });

  const title = type === "movie" ? data.title : data.name;
  const poster = data.poster_path
    ? `${imageBase}/w500${data.poster_path}`
    : data.backdrop_path
    ? `${imageBase}/original${data.backdrop_path}`
    : null;

  const episodes = [];
  if (type === "movie") {
    episodes.push({
      id: `movie:${tmdbId}:1:1`,
      number: 1,
      episode: 1,
      title: title,
    });
  } else if (Array.isArray(data.seasons)) {
    for (const s of data.seasons) {
      if (s.season_number > 0) {
        for (let ep = 1; ep <= (s.episode_count || 1); ep++) {
          episodes.push({
            id: `tv:${tmdbId}:${s.season_number}:${ep}`,
            number: ep,
            season: s.season_number,
            episode: ep,
            title: `Season ${s.season_number} Episode ${ep}`,
          });
        }
      }
    }
  }

  return {
    id: `${type}:${tmdbId}`,
    dataId: `${type}:${tmdbId}`,
    title: title || "Unknown Title",
    image: poster,
    description: data.overview || "",
    genres: (data.genres || []).map((g) => g.name),
    status: data.status || "Completed",
    totalEpisodes: episodes.length,
    episodes,
  };
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
    console.error("Bingr fetchEpisode error:", err.message);
    return { TotalPages: 1, total: 0, episodes: [] };
  }
}

/**
 * Stream & Subtitle Extraction Engine.
 * Resolves high-speed multi-quality HLS streams (Orion HLS, Vidly HLS)
 * and partner streaming servers.
 */
async function fetchEpisodeSources(episodeId, category = null) {
  const sources = [];
  const subtitles = [];

  let type = "movie";
  let tmdbId = String(episodeId || "").trim();
  let season = 1;
  let episode = 1;

  if (tmdbId.includes(":")) {
    const parts = tmdbId.split(":");
    type = parts[0] === "tv" ? "tv" : "movie";
    tmdbId = parts[1];
    season = parseInt(parts[2], 10) || 1;
    episode = parseInt(parts[3], 10) || 1;
  }

  // Register dynamic referer rules for video players & CDNs
  if (typeof _global.registerStreamHeaders === "function") {
    _global.registerStreamHeaders("embed.vidrift.in", {
      Referer: "https://embed.vidrift.in/",
      Origin: "https://embed.vidrift.in",
    });
    _global.registerStreamHeaders("sacdn.hakunaymatata.com", {
      Referer: "https://embed.vidrift.in/",
      Origin: "https://embed.vidrift.in",
    });
    _global.registerStreamHeaders("rousav.tech", {
      Referer: "https://vidly.pro/",
      Origin: "https://vidly.pro",
    });
    _global.registerStreamHeaders("vidly.pro", {
      Referer: "https://vidly.pro/",
      Origin: "https://vidly.pro",
    });
  }

  if (typeof _global.registerSubrequestHeaders === "function") {
    _global.registerSubrequestHeaders("sacdn.hakunaymatata.com", {
      Referer: "https://embed.vidrift.in/",
      Origin: "https://embed.vidrift.in",
    });
    _global.registerSubrequestHeaders("rousav.tech", {
      Referer: "https://vidly.pro/",
      Origin: "https://vidly.pro",
    });
  }

  // 1. Primary: Extract high-speed multi-quality Orion HLS from Vidrift
  try {
    const vidriftUrl =
      type === "tv"
        ? `https://embed.vidrift.in/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://embed.vidrift.in/embed/movie/${tmdbId}`;

    const vidriftRes = await httpGet(vidriftUrl, {
      headers: { Referer: "https://bingr.one/" },
      timeout: 8000,
    });

    const html = typeof vidriftRes.data === "string" ? vidriftRes.data : "";
    if (html) {
      // Find Orion master m3u8 playlists
      const orionMatches = html.match(/\/api\/orion\/[a-f0-9]+\/master\.m3u8/g) || [];
      const uniqueOrion = [...new Set(orionMatches)];

      for (let i = 0; i < uniqueOrion.length; i++) {
        const streamPath = uniqueOrion[i];
        const streamUrl = `https://embed.vidrift.in${streamPath}`;
        sources.push({
          name: i === 0 ? "Bingr Orion (Fast HLS 1080p)" : `Bingr Orion Backup ${i} (HLS)`,
          quality: "1080p / 720p (HLS)",
          url: streamUrl,
          isM3U8: true,
          headers: {
            Referer: "https://embed.vidrift.in/",
            Origin: "https://embed.vidrift.in",
          },
        });
      }

      // Extract subtitles from subtitleTracks
      const subMatch = html.match(/var\s+subtitleTracks\s*=\s*(\[[^\]]+\])/);
      if (subMatch && subMatch[1]) {
        try {
          const parsedSubs = JSON.parse(subMatch[1]);
          if (Array.isArray(parsedSubs)) {
            for (const s of parsedSubs) {
              if (s.url) {
                const subUrl = s.url.startsWith("http") ? s.url : `https://embed.vidrift.in${s.url}`;
                subtitles.push({
                  url: subUrl,
                  lang: s.label || s.lang || "English",
                });
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (vidriftErr) {
    console.warn("Vidrift stream extraction notice:", vidriftErr.message);
  }

  // 2. Secondary: Extract direct HLS master playlist from Vidly
  try {
    const vidlyUrl =
      type === "tv"
        ? `https://vidly.pro/tv/${tmdbId}/${season}/${episode}`
        : `https://vidly.pro/movie/${tmdbId}`;

    const vidlyRes = await httpGet(vidlyUrl, {
      headers: { Referer: "https://vidly.pro/" },
      timeout: 7000,
    });

    const vidlyHtml = typeof vidlyRes.data === "string" ? vidlyRes.data : "";
    if (vidlyHtml) {
      const vidlyM3u8 = vidlyHtml.match(/https?:\/\/[a-zA-Z0-9.\-/_]+\.m3u8/g) || [];
      const uniqueVidly = [...new Set(vidlyM3u8)].filter((u) => !u.includes("dash-hls-bridge"));

      for (const m3u8Url of uniqueVidly) {
        if (!sources.some((s) => s.url === m3u8Url)) {
          sources.push({
            name: "Bingr Vidly CDN (Direct HLS)",
            quality: "1080p (HLS)",
            url: m3u8Url,
            isM3U8: true,
            headers: {
              Referer: "https://vidly.pro/",
              Origin: "https://vidly.pro",
            },
          });
        }
      }
    }
  } catch (vidlyErr) {
    console.warn("Vidly stream extraction notice:", vidlyErr.message);
  }

  // 3. Fallback Partner Streaming Players
  const partnerServers = [
    {
      id: "vidbolt",
      name: "Bingr Vidbolt",
      url: type === "tv" ? `https://vidbolt.xyz/tv/${tmdbId}/${season}/${episode}` : `https://vidbolt.xyz/movie/${tmdbId}`,
    },
    {
      id: "cinezo",
      name: "Bingr Cinezo",
      url: type === "tv" ? `https://player.cinezo.live/embed/tv/${tmdbId}/${season}/${episode}` : `https://player.cinezo.live/embed/movie/${tmdbId}`,
    },
    {
      id: "vidy",
      name: "Bingr Vidy",
      url: type === "tv" ? `https://www.vidy.st/tv/${tmdbId}/${season}/${episode}` : `https://www.vidy.st/movie/${tmdbId}`,
    },
  ];

  for (const server of partnerServers) {
    if (!sources.some((s) => s.url === server.url)) {
      sources.push({
        name: server.name,
        quality: "1080p / 720p (Stream)",
        url: server.url,
        isM3U8: false,
        headers: {
          Referer: "https://bingr.one/",
          Origin: "https://bingr.one",
        },
      });
    }
  }

  return { sources, subtitles };
}

module.exports = {
  name: "bingr",
  version: "1.0.0",
  baseUrl: primaryBaseUrl,
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
