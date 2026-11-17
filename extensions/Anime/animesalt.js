/**
 * StrawVerse Extension - AnimeSalt Scraper
 * Specializing in Multi-Language Dubbed & Subbed Anime (Hindi, Tamil, Telugu, Malayalam, English, Japanese)
 * Based on https://animesalt.ro/ and StrawVerse Extension Specification.
 */

const cheerio = require("cheerio");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const zlib = require("zlib");

function nodeHttpsStreamAdapter(config) {
  return new Promise((resolve, reject) => {
    function executeRequest(currentUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error("Too many redirects"));
      }
      try {
        const u = new URL(currentUrl);
        const method = (config.method || "GET").toUpperCase();

        const flatHeaders = {};
        if (config.headers) {
          if (typeof config.headers.toJSON === "function") {
            Object.assign(flatHeaders, config.headers.toJSON());
          } else {
            Object.assign(flatHeaders, config.headers);
          }
        }

        let callerReferer = null;
        let callerOrigin = null;
        for (const k of Object.keys(flatHeaders)) {
          const lk = k.toLowerCase();
          if (lk === "referer") callerReferer = flatHeaders[k];
          if (lk === "origin") callerOrigin = flatHeaders[k];
          if (
            lk === "user-agent" ||
            lk === "referer" ||
            lk === "origin" ||
            lk === "host" ||
            lk === "accept-encoding"
          ) {
            delete flatHeaders[k];
          }
        }

        flatHeaders["Host"] = u.hostname;
        flatHeaders["User-Agent"] =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

        const hostLower = u.hostname.toLowerCase();
        const pathLower = u.pathname.toLowerCase();

        // 1. Honor caller-supplied Referer & Origin if passed
        if (callerReferer) {
          flatHeaders["Referer"] = callerReferer;
          flatHeaders["Origin"] =
            callerOrigin || callerReferer.replace(/\/+$/, "");
        } else if (
          hostLower.includes("playdrive") ||
          hostLower.includes("play4u") ||
          hostLower.includes("gothamnet") ||
          hostLower.includes("uprising") ||
          hostLower.includes("furiosamedia") ||
          pathLower.includes("/range/")
        ) {
          const baseHost =
            hostLower.includes("play4u") || hostLower.includes("uprising")
              ? "https://play4u.org/"
              : "https://playdrive.vip/";
          flatHeaders["Referer"] = baseHost;
          flatHeaders["Origin"] = baseHost.replace(/\/+$/, "");
        } else if (
          hostLower.includes("hdstream4u") ||
          hostLower.includes("acek-cdn") ||
          hostLower.includes("dramiyos")
        ) {
          flatHeaders["Referer"] = "https://hdstream4u.com/";
          flatHeaders["Origin"] = "https://hdstream4u.com";
        } else if (
          hostLower.includes("vidrift") ||
          hostLower.includes("hakunaymatata")
        ) {
          flatHeaders["Referer"] = "https://embed.vidrift.in/";
          flatHeaders["Origin"] = "https://embed.vidrift.in";
        } else if (hostLower.includes("vidly") || hostLower.includes("rousav")) {
          flatHeaders["Referer"] = "https://vidly.pro/";
          flatHeaders["Origin"] = "https://vidly.pro";
        } else if (hostLower.includes("vidbolt")) {
          flatHeaders["Referer"] = "https://vidbolt.xyz/";
          flatHeaders["Origin"] = "https://vidbolt.xyz";
        } else if (hostLower.includes("cinezo")) {
          flatHeaders["Referer"] = "https://player.cinezo.live/";
          flatHeaders["Origin"] = "https://player.cinezo.live";
        } else if (hostLower.includes("vidy")) {
          flatHeaders["Referer"] = "https://www.vidy.st/";
          flatHeaders["Origin"] = "https://www.vidy.st";
        } else if (hostLower.includes("lightspeed")) {
          flatHeaders["Referer"] = "https://cinejoy.pk/";
          flatHeaders["Origin"] = "https://cinejoy.pk";
        } else if (hostLower.includes("vidbasic")) {
          flatHeaders["Referer"] = "https://vidbasic.top/";
          flatHeaders["Origin"] = "https://vidbasic.top";
        } else if (
          hostLower.includes("vidmoly") ||
          hostLower.includes("vmnow") ||
          hostLower.includes("vmpx")
        ) {
          flatHeaders["Referer"] = "https://vidmoly.org/";
          flatHeaders["Origin"] = "https://vidmoly.org";
        } else if (hostLower.includes("mixdrop")) {
          flatHeaders["Referer"] = "https://mixdrop.ag/";
        } else if (
          hostLower.includes("streamtape") ||
          hostLower.includes("watchadsontape")
        ) {
          flatHeaders["Referer"] = "https://streamtape.com/";
        } else if (
          hostLower.includes("streamwish") ||
          hostLower.includes("flaswish") ||
          hostLower.includes("strwish")
        ) {
          flatHeaders["Referer"] = "https://streamwish.to/";
        } else if (hostLower.includes("sssrr.org")) {
          flatHeaders["Referer"] = "https://player.abyssplayer.com/";
          flatHeaders["Origin"] = "https://player.abyssplayer.com";
        } else if (hostLower.includes("abyss")) {
          flatHeaders["Referer"] = "https://animesalt.ro/";
          flatHeaders["Origin"] = "https://animesalt.ro";
        } else if (hostLower.includes("nekomux")) {
          flatHeaders["Referer"] = "https://player.nekomux.com/";
          flatHeaders["Origin"] = "https://player.nekomux.com";
        } else if (hostLower.includes("reanime")) {
          flatHeaders["Referer"] = "https://reanime.to/";
          flatHeaders["Origin"] = "https://reanime.to";
        } else if (hostLower.includes("1hanime")) {
          flatHeaders["Referer"] = "https://1hanime.com/";
          flatHeaders["Origin"] = "https://1hanime.com";
        } else if (hostLower.includes("bingr")) {
          flatHeaders["Referer"] = "https://bingr.one/";
          flatHeaders["Origin"] = "https://bingr.one";
        } else {
          flatHeaders["Referer"] = "https://animesalt.ro/";
        }

        if (!flatHeaders["Accept"]) {
          flatHeaders["Accept"] = "*/*";
        }

        const reqOptions = {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: method,
          headers: flatHeaders,
        };

        const transport = u.protocol === "https:" ? https : http;
        const req = transport.request(reqOptions, (res) => {
          const statusCode = res.statusCode || 200;
          const resHeaders = res.headers || {};

          // Follow redirects automatically, but abort if redirected away to anti-bot traps
          if (
            (statusCode === 301 ||
              statusCode === 302 ||
              statusCode === 303 ||
              statusCode === 307 ||
              statusCode === 308) &&
            resHeaders.location
          ) {
            res.resume();
            const nextUrl = new URL(resHeaders.location, currentUrl).toString();
            const nextHost = new URL(nextUrl).hostname.toLowerCase();
            if (
              nextHost.includes("google.com") ||
              nextHost.includes("recaptcha")
            ) {
              const err = new Error(
                `Request rejected by upstream redirecting to ${nextHost}`
              );
              err.status = 403;
              err.isAxiosError = true;
              return reject(err);
            }
            return executeRequest(nextUrl, redirectCount + 1);
          }

          function createResponse(data) {
            return {
              status: statusCode,
              statusText: res.statusMessage || "OK",
              headers: resHeaders,
              config,
              request: req,
              data,
            };
          }

          function handleValidateStatus(responseObj) {
            const isValid =
              typeof config.validateStatus === "function"
                ? config.validateStatus(statusCode)
                : statusCode >= 200 && statusCode < 300;
            if (!isValid) {
              const err = new Error(
                `Request failed with status code ${statusCode}`
              );
              err.config = config;
              err.request = req;
              err.response = responseObj;
              err.status = statusCode;
              err.isAxiosError = true;
              return reject(err);
            }
            resolve(responseObj);
          }

          if (config.responseType === "stream" || method === "HEAD") {
            const resp = createResponse(res);
            return handleValidateStatus(resp);
          }

          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            let buf = Buffer.concat(chunks);
            const enc = (resHeaders["content-encoding"] || "").toLowerCase();
            try {
              if (enc === "gzip") {
                buf = zlib.gunzipSync(buf);
              } else if (enc === "deflate") {
                buf = zlib.inflateSync(buf);
              } else if (enc === "br") {
                buf = zlib.brotliDecompressSync(buf);
              }
            } catch (_) {}

            if (
              config.responseType === "arraybuffer" ||
              config.responseType === "buffer"
            ) {
              return handleValidateStatus(createResponse(buf));
            }

            const text = buf.toString("utf8");
            let data = text;
            try {
              data = JSON.parse(text);
            } catch (_) {}

            handleValidateStatus(createResponse(data));
          });
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
    }

    executeRequest(config.url);
  });
}

function installStreamProxyInterceptor() {
  if (!global.axios || !global.axios.interceptors?.request) return;

  if (global.__strawverseStreamInterceptorId !== undefined) {
    try {
      global.axios.interceptors.request.eject(global.__strawverseStreamInterceptorId);
    } catch (_) {}
  }

  global.__strawverseStreamInterceptorId = global.axios.interceptors.request.use(
    (config) => {
      try {
        const urlStr = String(config.url || "").toLowerCase();
        const isMediaStream =
          config.responseType === "stream" ||
          urlStr.includes(".m3u8") ||
          urlStr.includes(".ts") ||
          urlStr.includes(".m4s") ||
          urlStr.includes(".mp4") ||
          urlStr.includes("#video.mp4") ||
          urlStr.includes("gothamnet") ||
          urlStr.includes("uprising") ||
          urlStr.includes("furiosamedia") ||
          urlStr.includes("/range/") ||
          urlStr.includes("playdrive") ||
          urlStr.includes("play4u") ||
          urlStr.includes("hdstream") ||
          urlStr.includes("streamwish") ||
          urlStr.includes("streamtape") ||
          urlStr.includes("mixdrop") ||
          urlStr.includes("filelions") ||
          urlStr.includes("vidbasic") ||
          urlStr.includes("vidmoly") ||
          urlStr.includes("sssrr.org") ||
          urlStr.includes("abyss") ||
          urlStr.includes("nekomux") ||
          urlStr.includes("flixcloud") ||
          urlStr.includes("rundowncdn") ||
          urlStr.includes("fetch9") ||
          urlStr.includes("r2.1hanime.com") ||
          urlStr.includes("htstreaming.com") ||
          urlStr.includes("nhplayer.com") ||
          urlStr.includes("vidrift") ||
          urlStr.includes("hakunaymatata") ||
          urlStr.includes("rousav") ||
          urlStr.includes("vidbolt") ||
          urlStr.includes("cinezo") ||
          urlStr.includes("vidy") ||
          urlStr.includes("lightspeed") ||
          urlStr.includes("vidly");

        const isTarget =
          isMediaStream ||
          urlStr.includes("animesalt.ro") ||
          urlStr.includes("abyssplayer.com") ||
          urlStr.includes("abysscdn.com") ||
          urlStr.includes("nekomux.com");

        if (isTarget) {
          config.strawverseDirectHttp = true;
          config._forceNativeBridge = false;

          if (isMediaStream) {
            config.adapter = nodeHttpsStreamAdapter;
          }

          if (urlStr.includes("sssrr.org")) {
            try {
              const u = new URL(config.url);
              if (config.headers?.set) {
                config.headers.set("Host", u.hostname);
                config.headers.set(
                  "User-Agent",
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                );
                config.headers.set("Referer", "https://player.abyssplayer.com/");
                config.headers.set("Origin", "https://player.abyssplayer.com");
              } else {
                config.headers = config.headers || {};
                config.headers["Host"] = u.hostname;
                config.headers["User-Agent"] =
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
                config.headers["Referer"] = "https://player.abyssplayer.com/";
                config.headers["Origin"] = "https://player.abyssplayer.com";
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

const baseUrl = "https://animesalt.ro";

// Last fetched anime context for numeric episodeId fallback
let lastAnimeContext = {
  slug: "",
  episodes: [],
};

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
    lastAnimeContext = {
      slug,
      episodes,
    };
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
 * Note: Abyss player (player.abyssplayer.com) uses custom in-browser WebCrypto AES-CTR
 * decryption over WebSocket streams (wss://) to an MSE SourceBuffer. The raw binary
 * chunks hosted on sssrr.org are not standard MP4 containers and cannot be decoded by
 * native media players (MPV, FFmpeg, ExoPlayer). We skip Abyss streams to prevent
 * player format crashes and Android OutOfMemory errors.
 */
async function resolveAbyssStream(_embedUrl) {
  return [];
}

function resolveCandidateSlugs(id) {
  const raw = String(id || "").trim();
  const list = [];
  if (raw.includes(":")) {
    const parts = raw.split(":");
    const aSlug = cleanSlug(parts[0]);
    const ep = parseInt(parts[1], 10) || 1;
    list.push(`${aSlug}-1x${ep}`);
    list.push(`${aSlug}-${ep}`);
    list.push(`${aSlug}-episode-${ep}`);
    list.push(aSlug);
  } else if (/^\d+$/.test(raw)) {
    const epNum = parseInt(raw, 10);
    if (lastAnimeContext.episodes && lastAnimeContext.episodes.length > 0) {
      const match = lastAnimeContext.episodes.find(
        (e) => Number(e.number) === epNum
      );
      if (match && match.id) list.push(cleanSlug(match.id));
    }
    if (lastAnimeContext.slug) {
      list.push(`${lastAnimeContext.slug}-1x${epNum}`);
      list.push(`${lastAnimeContext.slug}-${epNum}`);
      list.push(`${lastAnimeContext.slug}-episode-${epNum}`);
    }
  } else {
    const clean = cleanSlug(raw);
    list.push(clean);
    const m1 = clean.match(/^(.+)-(\d+)x(\d+)$/);
    if (m1) {
      list.push(`${m1[1]}-${m1[3]}`);
      list.push(`${m1[1]}-episode-${m1[3]}`);
    }
    const m2 = clean.match(/^(.+)-episode-(\d+)$/i);
    if (m2) {
      list.push(`${m2[1]}-1x${m2[2]}`);
      list.push(`${m2[1]}-${m2[2]}`);
    }
    const m3 = clean.match(/^(.+)-(\d+)$/);
    if (m3) {
      list.push(`${m3[1]}-1x${m3[2]}`);
      list.push(`${m3[1]}-episode-${m3[2]}`);
    }
  }
  return [...new Set(list.filter(Boolean))];
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
    installStreamProxyInterceptor();

    try {
      if (typeof global.setDynamicReferer === "function") {
        global.setDynamicReferer("sssrr.org", "https://player.abyssplayer.com/");
        global.setDynamicReferer("abyssplayer.com", "https://animesalt.ro/");
        global.setDynamicReferer("player.abyssplayer.com", "https://animesalt.ro/");
        global.setDynamicReferer("player.nekomux.com", "https://animesalt.ro/");
        global.setDynamicReferer("nekomux.com", "https://animesalt.ro/");
      }
    } catch (_) {}

    const candidateSlugs = resolveCandidateSlugs(episodeId);
    let html = "";
    for (const slug of candidateSlugs) {
      const episodeUrl = `${baseUrl}/${slug}/`;
      const res = await httpGet(episodeUrl, {
        headers: { Referer: `${baseUrl}/` },
      });
      const dataStr = typeof res.data === "string" ? res.data : "";
      if (
        dataStr &&
        (dataStr.includes("server-button") || dataStr.includes("loadMi"))
      ) {
        html = dataStr;
        break;
      }
      if (
        !html &&
        dataStr &&
        !dataStr.includes("Page Not Found") &&
        !dataStr.includes("404")
      ) {
        html = dataStr;
      }
    }

    if (!html) return { sources: [], subtitles: [] };

    const $ = cheerio.load(html);
    const sources = [];
    const subtitles = [];
    const reqCat = category ? String(category).toLowerCase() : null;

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
          const streamType = reqCat || "sub";
          sources.push({
            name: "AnimeSalt NekoMux (Multi-Audio: Hindi / Tamil / Telugu / Eng)",
            quality: "1080p (Multi-Audio HLS - Hindi Default)",
            url: hlsUrl,
            isM3U8: true,
            headers: {
              Referer: "https://player.nekomux.com/",
              Origin: "https://player.nekomux.com",
            },
            lang: streamType,
            type: streamType,
            isDub: reqCat === "dub",
          });
          break; // First working NekoMux stream is the complete multi-audio master
        }
      }
    }

    // 2. Look for any direct HLS (.m3u8) or direct video files (.mp4/.mkv/.webm)
    for (const btn of serverButtons) {
      const isDirectMedia =
        btn.url.includes(".m3u8") ||
        Boolean(btn.url.split("?")[0].match(/\.(mp4|mkv|webm)$/i));
      if (isDirectMedia) {
        const isM3u8 = btn.url.includes(".m3u8");
        const langName = btn.title || "Server";
        const isDub = !langName.toLowerCase().includes("sub");
        const streamType = reqCat || (isDub ? "dub" : "sub");
        const isDubFlag = reqCat === "sub" ? false : (reqCat === "dub" ? true : isDub);
        sources.push({
          name: `AnimeSalt (${langName})`,
          quality: isM3u8 ? "HLS" : "Direct",
          url: btn.url,
          isM3U8: isM3u8,
          headers: {
            Referer: "https://animesalt.ro/",
          },
          lang: streamType,
          type: streamType,
          isDub: isDubFlag,
        });
      }
    }

    // Notice for Abyss streams: Abyss Player uses client-side WebCrypto decryption
    // over WebSockets (wss://) to an MSE SourceBuffer; its raw chunks are not playable
    // by native players (MPV/ExoPlayer).
    const hasAbyssOnly =
      sources.length === 0 &&
      serverButtons.some(
        (b) =>
          b.url.includes("abyssplayer.com") ||
          b.url.includes("abysscdn.com") ||
          b.url.includes("multilang.php?data=")
      );
    if (hasAbyssOnly) {
      console.warn(
        `[AnimeSalt] Only Abyss Player streams found for "${episodeId}". Abyss uses proprietary in-browser WebSocket encryption and cannot be played directly by MPV or mobile video players.`
      );
    }

    // Sort: Multi-Audio HLS first, direct MP4 streams
    sources.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const score = (name, isM3u8) => {
        if (isM3u8) return 100;
        if (name.includes("hindi")) return 90;
        if (name.includes("multi")) return 80;
        if (name.includes("english")) return 70;
        if (name.includes("tamil")) return 60;
        if (name.includes("telugu")) return 50;
        return 40;
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

async function healId({ oldId, malid, title, folderName }) {
  try {
    const q = title || folderName || oldId;
    if (!q) return null;
    const searchRes = await SearchAnime(q, 1);
    if (searchRes && searchRes.results && searchRes.results.length > 0) {
      return searchRes.results[0].id;
    }
  } catch (_) {}
  return null;
}

module.exports = {
  name: "animesalt",
  version: "1.0.8",
  baseUrl,
  headerRules,
  subrequestHeaders,
  bypassDomains,
  healId,
  SearchAnime,
  SearchMovie: SearchAnime,
  AnimeInfo,
  MovieInfo: AnimeInfo,
  fetchEpisode,
  fetchEpisodeSources,
  fetchRecentEpisodes,
  fetchTrending: fetchRecentEpisodes,
};
