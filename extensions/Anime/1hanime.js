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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
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
  if (global.axios) {
    try {
      return await global.axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: `${baseUrl}/`,
          ...(options.headers || {}),
        },
        timeout: options.timeout || 25000,
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });
    } catch (err) {
      if (!options._retry) {
        return httpGet(url, { ...options, _retry: true });
      }
      throw err;
    }
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `${baseUrl}/`,
      ...(options.headers || {}),
    },
    redirect: "follow",
  });

  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
}

// Clean slug helper
function cleanSlug(slug) {
  if (!slug) return "";
  let cleaned = String(slug).trim();
  cleaned = cleaned.replace(/^https?:\/\/[^\/]+\//, "");
  cleaned = cleaned.replace(/^\/+/, "").replace(/\/+$/, "");
  cleaned = cleaned.replace(/^(?:series|hentai|watch|video)\//, "");
  return cleaned;
}

// Ensure absolute image URL
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

// Ensure integer page
function normalizePage(page) {
  const p = parseInt(page, 10);
  return isNaN(p) || p < 1 ? 1 : p;
}

// Extract next_f hydration payloads from RSC HTML response
function extractRscPayload(html) {
  if (!html) return "";
  const pushes = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs),
  ].map((m) => m[1]);
  if (pushes.length === 0) return html;
  return pushes
    .map((chunk) =>
      chunk.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n"),
    )
    .join("\n");
}

/**
 * Universal NHPlayer challenge solver.
 * Handles both v1 classic tokens and v2 randomized DOM selectors with PoW.
 */
async function solveNhPlayer(embedUrl) {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
  const playerUrl = embedUrl.endsWith("/") ? embedUrl : `${embedUrl}/`;

  const res1 = await httpGet(playerUrl, {
    headers: {
      "User-Agent": ua,
      Referer: `${baseUrl}/`,
    },
  });

  const pageHtml = typeof res1.data === "string" ? res1.data : "";

  let cookieHeader = "";
  if (res1.headers && res1.headers["set-cookie"]) {
    const rawCookies = Array.isArray(res1.headers["set-cookie"])
      ? res1.headers["set-cookie"]
      : [res1.headers["set-cookie"]];
    cookieHeader = rawCookies.map((c) => c.split(";")[0].trim()).join("; ");
  }

  // Check if player has data-id leading to player.php (v2 core)
  const dataIdMatch =
    pageHtml.match(/data-id="(\/player\.php\?[^"]+)"/) ||
    pageHtml.match(/src="(\/player\.php\?[^"]+)"/) ||
    pageHtml.match(/data-id="([^"]+)"/);
  if (dataIdMatch) {
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

    const resPlayer = await httpGet(fullPlayerUrl, {
      headers: {
        "User-Agent": ua,
        Referer: playerUrl,
        Cookie: cookieHeader,
      },
    });

    if (resPlayer.headers && resPlayer.headers["set-cookie"]) {
      const rawCookies = Array.isArray(resPlayer.headers["set-cookie"])
        ? resPlayer.headers["set-cookie"]
        : [resPlayer.headers["set-cookie"]];
      const newCookies = rawCookies
        .map((c) => c.split(";")[0].trim())
        .join("; ");
      cookieHeader = cookieHeader
        ? `${cookieHeader}; ${newCookies}`
        : newCookies;
    }

    const playerHtml =
      typeof resPlayer.data === "string" ? resPlayer.data : "";

    const pVMatch = playerHtml.match(/window\._pV=\{([^}]+)\}/);
    if (pVMatch) {
      const vidMatch = pVMatch[1].match(/vid:"([^"]+)"/);
      const ctMatch = pVMatch[1].match(/ct:"([^"]+)"/);
      const pidMatch = pVMatch[1].match(/pid:"([^"]+)"/);
      const stMatch = pVMatch[1].match(/st:"([^"]+)"/);

      const coreMatch = playerHtml.match(/src="(player-core-v2\.php\?[^"]+)"/);
      if (coreMatch) {
        const coreUrl = `https://nhplayer.com/${coreMatch[1]}`;
        const resCore = await httpGet(coreUrl, {
          headers: {
            "User-Agent": ua,
            Referer: fullPlayerUrl,
            Cookie: cookieHeader,
          },
        });
        const coreJs = typeof resCore.data === "string" ? resCore.data : "";

        const sc =
          coreJs.match(
            /var\s+_[a-zA-Z0-9]+\s*=\s*['"]([a-f0-9]{8}\.[a-f0-9]{16})['"]/,
          ) || [];
        const rid =
          coreJs.match(/var\s+_[a-zA-Z0-9]+\s*=\s*['"]([a-f0-9]{16})['"]/) ||
          [];

        const idMatches = [
          ...coreJs.matchAll(
            /function\(\)\{return d\.getElementById\('([^']+)'\);?\}/g,
          ),
        ].map((m) => m[1]);
        const attrMatches = [
          ...coreJs.matchAll(/getAttribute\('([^']+)'\)/g),
        ].map((m) => m[1]);

        if (idMatches.length >= 5 && attrMatches.length >= 3) {
          const [id1, id2, id3, id4, id5] = idMatches;
          const [attr1, attr3, attrTs] = attrMatches;

          const el1 = playerHtml.match(
            new RegExp(`<[^>]+id="${id1}"[^>]*>`),
          );
          const p1 = el1
            ? (el1[0].match(new RegExp(`${attr1}="([^"]+)"`)) || [])[1]
            : "";

          const el2 = playerHtml.match(
            new RegExp(`<[^>]+id="${id2}"[^>]*>`),
          );
          const p2 = el2 ? (el2[0].match(/value="([^"]+)"/) || [])[1] : "";

          const el3 = playerHtml.match(
            new RegExp(`<[^>]+id="${id3}"[^>]*>`),
          );
          const p3 = el3
            ? (el3[0].match(new RegExp(`${attr3}="([^"]+)"`)) || [])[1]
            : "";

          const el4 = playerHtml.match(
            new RegExp(
              `<template[^>]+id="${id4}"[^>]*>([\\s\\S]*?)<\\/template>`,
            ),
          );
          const p4 = el4 ? el4[1].replace(/<[^>]+>/g, "").trim() : "";

          const el5 = playerHtml.match(
            new RegExp(`<[^>]+id="${id5}"[^>]*>`),
          );
          const ts = el5
            ? (el5[0].match(new RegExp(`${attrTs}="([^"]+)"`)) || [])[1]
            : "";

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
            sc: sc[1] || "",
            rid: rid[1] || "",
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
              Cookie: cookieHeader,
              "X-Requested-With": "XMLHttpRequest",
            },
          });

          const data =
            typeof resApi.data === "object"
              ? resApi.data
              : JSON.parse(resApi.data);

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
  }

  // Classic v1 challenge solver
  const token1 = (pageHtml.match(/name="v_token"\s+value="([^"]+)"/) || [])[1];
  const token2 = (pageHtml.match(/name="v_token2"\s+value="([^"]+)"/) || [])[1];
  const token3 = (pageHtml.match(/name="v_token3"\s+value="([^"]+)"/) || [])[1];
  const token4 = (pageHtml.match(/name="v_token4"\s+value="([^"]+)"/) || [])[1];
  const token5 = (pageHtml.match(/name="v_token5"\s+value="([^"]+)"/) || [])[1];

  if (!token1 || !token2 || !token3 || !token4 || !token5) {
    throw new Error(
      "Failed to extract NHPlayer challenge tokens from player DOM.",
    );
  }

  const subtMatch = pageHtml.match(/src:\s*"([^"]+\.srt)"/);
  const subtitleUrl = subtMatch ? subtMatch[1] : null;

  const challengeUrl = `https://nhplayer.com/challenge.php?v=${encodeURIComponent(token1)}`;
  const res2 = await httpGet(challengeUrl, {
    headers: {
      "User-Agent": ua,
      Referer: playerUrl,
      Cookie: cookieHeader,
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (res2.headers && res2.headers["set-cookie"]) {
    const rawCookies = Array.isArray(res2.headers["set-cookie"])
      ? res2.headers["set-cookie"]
      : [res2.headers["set-cookie"]];
    const newCookies = rawCookies
      .map((c) => c.split(";")[0].trim())
      .join("; ");
    cookieHeader = cookieHeader
      ? `${cookieHeader}; ${newCookies}`
      : newCookies;
  }

  const sigData =
    typeof res2.data === "object" ? res2.data : JSON.parse(res2.data);
  const signature = sigData.x_signature;
  if (!signature) {
    throw new Error("Missing x_signature in NHPlayer challenge response.");
  }

  const powUrl = "https://nhplayer.com/pow-challenge.php";
  const res3 = await httpGet(powUrl, {
    headers: {
      "User-Agent": ua,
      Referer: playerUrl,
      Cookie: cookieHeader,
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const powData =
    typeof res3.data === "object" ? res3.data : JSON.parse(res3.data);
  const { prefix, difficulty } = powData;

  const targetZeros = "0".repeat(difficulty);
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
    if (nonce > 5000000) {
      throw new Error("NHPlayer PoW challenge timed out (5M iterations).");
    }
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

  const apiUrl = `https://nhplayer.com/get-video-url-v2.php?${params.toString()}`;
  const res4 = await httpGet(apiUrl, {
    headers: {
      "User-Agent": ua,
      Referer: playerUrl,
      Cookie: cookieHeader,
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
 * Search anime catalog using official JSON search endpoint.
 */
async function SearchAnime(query, page = 1) {
  try {
    const q = String(query).trim();
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

    const data = typeof res.data === "object" ? res.data : JSON.parse(res.data);
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
  try {
    const seriesSlug = cleanSlug(animeId);
    const seriesUrl = `${baseUrl}/series/${seriesSlug}`;

    const res = await httpGet(seriesUrl, {
      headers: { Referer: `${baseUrl}/` },
    });

    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    // Title extraction
    const titleMatch =
      rsc.match(/"name":"([^"]+)"/) ||
      html.match(/<h1[^>]*class="[^"]*genre-name[^"]*"[^>]*>(.*?)<\/h1>/i) ||
      html.match(/<title>(.*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace(/—.*$/, "").trim() : seriesSlug;

    // Cover extraction
    const coverMatch = rsc.match(/"cover":"([^"]+)"/);
    const cover = coverMatch ? normalizeImageUrl(coverMatch[1]) : "";

    // Synopsis extraction
    const descMatch =
      rsc.match(/"description":"([^"]+)"/) ||
      html.match(/<p[^>]*class="[^"]*genre-intro[^"]*"[^>]*>(.*?)<\/p>/i);
    const synopsis = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    // Episodes extraction
    const episodes = [];
    const seenEps = new Set();

    // Pattern 1: Rich episode card JSON objects inside RSC
    const cardRegex =
      /"wpId":(\d+),"slug":"([^"]+)","title":"([^"]*)","titleSlug":"([^"]*)","titleId":"[^"]*","ep":(\d+)/g;
    let match;
    while ((match = cardRegex.exec(rsc)) !== null) {
      const [_, wpId, epSlug, epTitle, epTitleSlug, epNum] = match;
      const fullEpId = `${wpId}/${epSlug}`;
      if (!seenEps.has(fullEpId)) {
        seenEps.add(fullEpId);
        episodes.push({
          id: fullEpId,
          number: parseInt(epNum, 10) || episodes.length + 1,
          title: epTitle ? `${epTitle} Episode ${epNum}` : `Episode ${epNum}`,
          image: cover,
        });
      }
    }

    // Pattern 2: Generic slug matching if pattern 1 did not find cards
    if (episodes.length === 0) {
      const slugRegex = /"slug":"([^"]*episode-(\d+)[^"]*)"/gi;
      while ((match = slugRegex.exec(rsc)) !== null) {
        const epSlug = match[1];
        const epNum = parseInt(match[2], 10) || episodes.length + 1;
        if (!seenEps.has(epSlug)) {
          seenEps.add(epSlug);
          episodes.push({
            id: epSlug,
            number: epNum,
            title: `Episode ${epNum}`,
            image: cover,
          });
        }
      }
    }

    // Sort episodes ascending
    episodes.sort((a, b) => a.number - b.number);

    return {
      id: seriesSlug,
      title,
      image: cover,
      cover,
      description: synopsis,
      status: "Completed",
      type: "Anime",
      episodes,
    };
  } catch (err) {
    console.error("1hanime AnimeInfo error:", err.message);
    return {
      id: cleanSlug(animeId),
      title: cleanSlug(animeId),
      image: "",
      cover: "",
      description: "",
      status: "Unknown",
      type: "Anime",
      episodes: [],
    };
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
    const episodeUrl = `${baseUrl}/${epSlug}`;

    const res = await httpGet(episodeUrl, {
      headers: { Referer: `${baseUrl}/` },
    });
    const html = typeof res.data === "string" ? res.data : "";
    const rsc = extractRscPayload(html);

    const embedMatch =
      rsc.match(/https:\/\/nhplayer\.com\/v\/[a-zA-Z0-9]+\/?/) ||
      html.match(/https:\/\/nhplayer\.com\/v\/[a-zA-Z0-9]+\/?/);

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

    const cardRegex =
      /"wpId":(\d+),"slug":"([^"]+)","title":"([^"]*)","titleSlug":"([^"]*)","titleId":"[^"]*","ep":(\d+)/g;
    let match;
    while ((match = cardRegex.exec(rsc)) !== null) {
      const [_, wpId, epSlug, epTitle, titleSlug, epNum] = match;
      const targetId = titleSlug || epSlug;
      if (!seen.has(targetId)) {
        seen.add(targetId);
        results.push({
          id: targetId,
          title: epTitle || targetId,
          image: normalizeImageUrl(`/uploads/media/2023/09/poster_${wpId}.jpg`),
          episodeNumber: parseInt(epNum, 10) || 1,
          type: "Anime",
        });
      }
    }

    // Fallback: title/slug regex
    if (results.length === 0) {
      const itemRegex =
        /"title":"([^"]+)","titleSlug":"([^"]+)","titleId":"[^"]*","ep":(\d+)/g;
      while ((match = itemRegex.exec(rsc)) !== null) {
        const [_, title, slug, epNum] = match;
        if (!seen.has(slug)) {
          seen.add(slug);
          results.push({
            id: slug,
            title,
            image: "",
            episodeNumber: parseInt(epNum, 10) || 1,
            type: "Anime",
          });
        }
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

    const cardRegex =
      /"wpId":(\d+),"slug":"([^"]+)","title":"([^"]*)","titleSlug":"([^"]*)","titleId":"[^"]*","ep":(\d+)/g;
    let match;
    while ((match = cardRegex.exec(rsc)) !== null) {
      const [_, wpId, epSlug, epTitle, titleSlug, epNum] = match;
      const targetId = titleSlug || epSlug;
      if (!seen.has(targetId)) {
        seen.add(targetId);
        results.push({
          id: targetId,
          title: epTitle || targetId,
          image: normalizeImageUrl(`/uploads/media/2023/09/poster_${wpId}.jpg`),
          episodeNumber: parseInt(epNum, 10) || 1,
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    };
  }
  return null;
}

module.exports = {
  name: "1hanime",
  version: "1.0.1",
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
