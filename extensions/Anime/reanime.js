/**
 * StrawVerse Extension - Re:ANIME Scraper
 * High-definition subbed and dubbed anime streaming with multi-server playback.
 * Based on https://reanime.cz/ (and https://reanime.to/)
 */

const http = require("http");
const https = require("https");
const nodeCrypto = require("crypto");

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

        for (const k of Object.keys(flatHeaders)) {
          const lk = k.toLowerCase();
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
        if (
          hostLower.includes("flixcloud") ||
          hostLower.includes("rundowncdn") ||
          hostLower.includes("fetch9")
        ) {
          flatHeaders["Referer"] = "https://flixcloud.cc/";
          flatHeaders["Origin"] = "https://flixcloud.cc";
        } else if (!flatHeaders["Referer"]) {
          flatHeaders["Referer"] = "https://reanime.cz/";
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

          // Follow redirects automatically
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
            return executeRequest(nextUrl, redirectCount + 1);
          }

          if (config.responseType === "stream" || method === "HEAD") {
            resolve({
              status: statusCode,
              statusText: res.statusMessage || "OK",
              headers: resHeaders,
              config,
              request: req,
              data: res,
            });
          } else if (
            config.responseType === "arraybuffer" ||
            config.responseType === "buffer"
          ) {
            const chunks = [];
            let totalLen = 0;
            res.on("data", (chunk) => {
              totalLen += chunk.length;
              if (totalLen <= 50 * 1024 * 1024) {
                chunks.push(chunk);
              }
            });
            res.on("end", () => {
              resolve({
                status: statusCode,
                statusText: res.statusMessage || "OK",
                headers: resHeaders,
                config,
                request: req,
                data: Buffer.concat(chunks),
              });
            });
          } else {
            let text = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (text += chunk));
            res.on("end", () => {
              let data = text;
              try {
                data = JSON.parse(text);
              } catch (_) {}
              resolve({
                status: statusCode,
                statusText: res.statusMessage || "OK",
                headers: resHeaders,
                config,
                request: req,
                data,
              });
            });
          }
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
          urlStr.includes("sssrr.org") ||
          urlStr.includes("abyss") ||
          urlStr.includes("nekomux") ||
          urlStr.includes("flixcloud") ||
          urlStr.includes("rundowncdn") ||
          urlStr.includes("fetch9") ||
          urlStr.includes("r2.1hanime.com") ||
          urlStr.includes("htstreaming.com") ||
          urlStr.includes("nhplayer.com") ||
          urlStr.includes("playdrive") ||
          urlStr.includes("streamtape") ||
          urlStr.includes("mixdrop") ||
          urlStr.includes("vidbasic") ||
          urlStr.includes("vidmoly") ||
          urlStr.includes("vidrift") ||
          urlStr.includes("vidly");

        const isTarget =
          isMediaStream ||
          urlStr.includes("reanime.cz") ||
          urlStr.includes("reanime.to");

        if (isTarget) {
          config.strawverseDirectHttp = true;
          config._forceNativeBridge = false;

          if (isMediaStream) {
            config.adapter = nodeHttpsStreamAdapter;
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

const baseUrl = "https://reanime.cz";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

let lastAnimeContext = {
  animeId: "",
  anilistId: 0,
  malId: 0,
  episodes: [],
};

// Declarative header rules for Re:ANIME, Flixcloud and CDNs
const headerRules = [
  {
    match: ["reanime.cz", "reanime.to"],
    headers: {
      Referer: "https://reanime.cz/",
      Origin: "https://reanime.cz",
      "User-Agent": USER_AGENT,
    },
  },
  {
    match: ["flixcloud.cc", "rundowncdn.top", "fetch9.flixcloud.cc"],
    headers: {
      Referer: "https://flixcloud.cc/",
      Origin: "https://flixcloud.cc",
      "User-Agent": USER_AGENT,
    },
  },
];

const subrequestHeaders = [
  {
    match: ["flixcloud.cc", "rundowncdn.top", "fetch9.flixcloud.cc"],
    headers: {
      Referer: "https://flixcloud.cc/",
      Origin: "https://flixcloud.cc",
      "User-Agent": USER_AGENT,
    },
  },
];

const bypassDomains = [
  "reanime.cz",
  "reanime.to",
  "flixcloud.cc",
  "rundowncdn.top",
  "fetch9.flixcloud.cc",
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
        return {
          data: err.response.data,
          status: err.response.status,
          headers: err.response.headers,
        };
      }
      throw err;
    }
  }

  const headers = {
    "User-Agent": USER_AGENT,
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

// Internal Local Stream Decryption Server for MPV
let localServer = null;
let localPort = 0;
const streamCache = new Map();

function cleanOldStreams() {
  const now = Date.now();
  for (const [id, item] of streamCache.entries()) {
    if (now - item.timestamp > 3 * 60 * 60 * 1000) {
      streamCache.delete(id);
    }
  }
}

function ensureLocalServer() {
  if (localServer && localPort) return Promise.resolve(localPort);

  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      const url = req.url || "";
      const match = url.match(/^\/reanime\/([^\/]+)\/([^\/\?]+)/);
      if (!match) {
        res.writeHead(404);
        return res.end();
      }

      const streamId = match[1];
      const file = match[2];
      const item = streamCache.get(streamId);

      if (!item) {
        res.writeHead(404);
        return res.end("Stream expired or not found");
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

      if (file === "master.m3u8") {
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        const body = item.masterM3u8
          .replace(/URI="audio\.m3u8"/g, `URI="http://127.0.0.1:${localPort}/reanime/${streamId}/audio.m3u8"`)
          .replace(/video\.m3u8/g, `http://127.0.0.1:${localPort}/reanime/${streamId}/video.m3u8`);
        return res.end(body);
      }

      if (file === "video.m3u8") {
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        const body = item.videoM3u8.replace(
          /URI="[^"]+"/g,
          `URI="http://127.0.0.1:${localPort}/reanime/${streamId}/key.bin"`
        );
        return res.end(body);
      }

      if (file === "audio.m3u8") {
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        const body = item.audioM3u8.replace(
          /URI="[^"]+"/g,
          `URI="http://127.0.0.1:${localPort}/reanime/${streamId}/key.bin"`
        );
        return res.end(body);
      }

      if (file === "key.bin") {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        return res.end(item.keyBuf);
      }

      res.writeHead(404);
      res.end();
    });

    localServer.on("error", reject);
    localServer.listen(0, "127.0.0.1", () => {
      localPort = localServer.address().port;
      resolve(localPort);
    });
  });
}

// Cryptographic primitives for Flixcloud WebAssembly deobfuscation
function Rt(t) {
  const e = atob(t);
  const a = new Uint8Array(e.length);
  for (let s = 0; s < e.length; s++) a[s] = e.charCodeAt(s);
  return a;
}

const webCrypto =
  typeof crypto !== "undefined" && crypto.subtle
    ? crypto
    : nodeCrypto.webcrypto;

async function ce(t) {
  const e = new TextEncoder().encode(t);
  const a = await webCrypto.subtle.digest("SHA-256", e);
  return Array.from(new Uint8Array(a))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
}

async function ar(t) {
  let e = t;
  for (let s = 0; s < 3; s++) e = await ce(e + s.toString());
  let a = e;
  for (let s = 0; s < 3; s++) a = await ce(a + s.toString());
  return {
    videoField: `vf_${e.substring(0, 8)}`,
    keyField: `kf_${e.substring(8, 16)}`,
    ivField: `ivf_${e.substring(16, 24)}`,
    containerName: `cd_${e.substring(24, 32)}`,
    arrayName: `ad_${e.substring(32, 40)}`,
    objectName: `od_${e.substring(40, 48)}`,
    tokenField: `${e.substring(48, 64)}_${e.substring(56, 64)}`,
    keyFrag2Field: `${a.substring(0, 16)}_${a.substring(16, 24)}`,
  };
}

function sr(t, e) {
  const a = t[e.containerName];
  if (!a) throw new Error("Container not found");
  const s = a[e.arrayName];
  if (!s || !Array.isArray(s) || s.length === 0) throw new Error("Array not found");
  const c = s[0][e.objectName];
  if (!c) throw new Error("Object not found");
  const f = c[e.keyField],
    i = c[e.ivField];
  if (!f || !i) throw new Error("Missing required fields");
  return { frag1_b64: f, iv_b64: i };
}

async function rr(t, e, a, s, g_wasm, E_wasm) {
  const S = new Uint8Array(E_wasm.buffer);
  const L = t.length;
  const T = 1000;
  const A = T + L;
  const w = A + L;
  const z = w + L;
  S.set(t, T);
  S.set(e, A);
  S.set(a, w);
  g_wasm._s(s);
  g_wasm._r(T, A, w, z, L);
  const R = new Uint8Array(L);
  R.set(S.subarray(z, z + L));
  return R;
}

/**
 * Decrypts Flixcloud embed stream parameters, decrypts HLS playlists,
 * and caches stream assets for local MPV playback.
 */
async function decryptFlixServer(dataLink) {
  const res = await httpGet(dataLink, {
    headers: {
      Referer: "https://reanime.cz/",
      Origin: "https://reanime.cz",
    },
    timeout: 9000,
  });

  const html = typeof res.data === "string" ? res.data : "";
  const match = html.match(/kit\.start\([^,]+,\s*[^,]+,\s*(\{[\s\S]*?\})\s*\);/);
  if (!match) throw new Error("Could not parse Flixcloud embed");

  const dataObj = new Function("return " + match[1])();
  const nodeData = dataObj.data?.find((d) => d && d.data)?.data;
  if (!nodeData || !nodeData.obfuscated_crypto_data) {
    throw new Error("Flixcloud missing obfuscated data");
  }

  const f_wasm = Rt(nodeData.w_payload);
  const wasmInstance = (await WebAssembly.instantiate(f_wasm, {})).instance;
  const g_wasm = wasmInstance.exports;
  const E_wasm = g_wasm.memory;
  if (E_wasm.buffer.byteLength === 0) E_wasm.grow(1);

  const t = nodeData.obfuscated_crypto_data;
  const e = nodeData.obfuscation_seed;
  const s = await ar(e);
  const c = sr(t, s);
  const f = nodeData[s.keyFrag2Field];

  let tokenRef = null;
  for (const [R_k, u_v] of Object.entries(nodeData)) {
    if (R_k === s.tokenField && typeof u_v === "string" && u_v.length > 0) {
      tokenRef = u_v;
      break;
    }
  }
  if (!tokenRef) throw new Error("Missing token ref");

  const tokenUrl = `https://flixcloud.cc/api/m3u8/${tokenRef}`;
  const tokenRes = await httpGet(tokenUrl, {
    headers: { Referer: dataLink, Origin: "https://flixcloud.cc" },
    timeout: 8000,
  });
  const S_token = typeof tokenRes.data === "object" ? tokenRes.data : JSON.parse(tokenRes.data);

  const L_key = (await ce(tokenRef + "vid")).substring(0, 10);
  const T_key = (await ce(tokenRef + "key")).substring(0, 10);
  const A = S_token[L_key];
  const w = S_token[T_key];

  const R = Rt(c.frag1_b64);
  const u = Rt(f);
  const h = Rt(w);
  const k = parseInt(e.substring(0, 8), 16);
  const H = await rr(R, u, h, k, g_wasm, E_wasm);

  const V = await webCrypto.subtle.importKey("raw", H, { name: "PBKDF2" }, false, ["deriveBits"]);
  const N = await webCrypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(e), iterations: 1000, hash: "SHA-256" },
    V,
    256
  );
  const Q = new Uint8Array(N);
  for (let W = 0; W < 32; W++) {
    Q[W] ^= e.charCodeAt(W % e.length);
  }
  const digest = await webCrypto.subtle.digest("SHA-256", Q);
  const o = new Uint8Array(digest);
  const v = Rt(c.iv_b64);
  const d = Rt(A);
  const l = await webCrypto.subtle.importKey("raw", o, { name: "AES-CBC" }, false, ["decrypt"]);
  const O = await webCrypto.subtle.decrypt({ name: "AES-CBC", iv: v }, l, d);
  const masterM3u8Url = new TextDecoder().decode(O);

  const pkOffset = g_wasm._c();
  const pkBytes = new Uint8Array(E_wasm.buffer).slice(pkOffset, pkOffset + 32);
  const pkB64 = btoa(String.fromCharCode(...pkBytes));
  const l_xor = atob(pkB64);

  function decryptM3u8(text) {
    if (typeof text !== "string") return "";
    if (text.startsWith("#EXTM3U")) return text;
    const u_sub = atob(text.trim());
    const decSubBytes = [];
    for (let idx = 0; idx < u_sub.length; idx++) {
      decSubBytes.push(u_sub.charCodeAt(idx) ^ l_xor.charCodeAt(idx % l_xor.length));
    }
    return new TextDecoder().decode(new Uint8Array(decSubBytes));
  }

  // Fetch encrypted master manifest
  const m3u8Res = await httpGet(masterM3u8Url, {
    headers: { Referer: "https://flixcloud.cc/", Origin: "https://flixcloud.cc" },
    timeout: 8000,
  });
  const decMaster = decryptM3u8(typeof m3u8Res.data === "string" ? m3u8Res.data : "");

  // Find video subplaylist
  const lines = decMaster.split("\n");
  const videoRelPath = lines.find((line) => line && !line.startsWith("#") && line.trim().length > 0);
  if (!videoRelPath) throw new Error("Could not find video subplaylist");
  const videoUrl = new URL(videoRelPath, masterM3u8Url).href;

  const videoRes = await httpGet(videoUrl, {
    headers: { Referer: "https://flixcloud.cc/", Origin: "https://flixcloud.cc" },
    timeout: 8000,
  });
  const decVideo = decryptM3u8(typeof videoRes.data === "string" ? videoRes.data : "");

  // Fetch key.bin
  const keyUrl = new URL("key.bin", videoUrl).href;
  const keyRes = await fetch(keyUrl, {
    headers: { Referer: "https://flixcloud.cc/", Origin: "https://flixcloud.cc", "User-Agent": USER_AGENT },
  });
  const keyBuf = Buffer.from(await keyRes.arrayBuffer());

  // Fetch audio subplaylist if separated
  let decAudio = "";
  const audioMatch = decMaster.match(/URI="([^"]+)"/);
  if (audioMatch) {
    const audioUrl = new URL(audioMatch[1], masterM3u8Url).href;
    const audioRes = await httpGet(audioUrl, {
      headers: { Referer: "https://flixcloud.cc/", Origin: "https://flixcloud.cc" },
      timeout: 8000,
    });
    decAudio = decryptM3u8(typeof audioRes.data === "string" ? audioRes.data : "");
  }

  // Prepare master playlist
  let masterContent = decMaster;
  masterContent = masterContent.replace(videoRelPath, "video.m3u8");
  if (audioMatch) {
    masterContent = masterContent.replace(audioMatch[1], "audio.m3u8");
  }

  // Extract subtitle tracks
  const subtitles = [];
  if (Array.isArray(nodeData.subtitles)) {
    for (const sub of nodeData.subtitles) {
      if (sub.url) {
        subtitles.push({
          url: sub.url,
          lang: sub.language || "English",
          default: !!sub.default,
        });
      }
    }
  }

  cleanOldStreams();
  const port = await ensureLocalServer();
  const streamId = Math.random().toString(36).substring(2, 10);
  streamCache.set(streamId, {
    masterM3u8: masterContent,
    videoM3u8: decVideo,
    audioM3u8: decAudio,
    keyBuf,
    timestamp: Date.now(),
  });

  return {
    streamUrl: `http://127.0.0.1:${port}/reanime/${streamId}/master.m3u8`,
    subtitles,
  };
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
      results,
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

    lastAnimeContext = {
      animeId: cleanId,
      anilistId,
      malId,
      episodes,
    };

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
 * Fetches Flixcloud video streaming servers, decrypts obfuscated HLS manifests,
 * and passes direct decrypted streaming playlists and subtitle tracks to MPV.
 */
async function fetchEpisodeSources(episodeId, category = null) {
  installStreamProxyInterceptor();
  const sources = [];
  const subtitles = [];

  let animeId = "";
  let epNum = 1;
  let anilistId = 0;
  let malId = 0;

  const rawId = String(episodeId || "").trim();
  const parts = rawId.split(":");
  if (parts.length >= 2) {
    animeId = parts[0];
    epNum = parseInt(parts[1], 10) || 1;
    anilistId = parseInt(parts[2], 10) || 0;
    malId = parseInt(parts[3], 10) || 0;
  } else if (/^\d+$/.test(rawId)) {
    epNum = parseInt(rawId, 10) || 1;
    if (lastAnimeContext.anilistId) {
      animeId = lastAnimeContext.animeId;
      anilistId = lastAnimeContext.anilistId;
      malId = lastAnimeContext.malId;
    }
  } else {
    animeId = rawId;
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
      Referer: "https://flixcloud.cc/",
      Origin: "https://flixcloud.cc",
    });
    _global.registerStreamHeaders("fetch9.flixcloud.cc", {
      Referer: "https://flixcloud.cc/",
      Origin: "https://flixcloud.cc",
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
      const subLanguagesSeen = new Set();

      // Resolve each server into a direct decrypted playable stream
      const serverTasks = flixRes.data.servers.map(async (server) => {
        if (!server.dataLink) return null;

        const serverLabel = server.serverName || "HD";
        const typeLabel = server.dataType ? `(${server.dataType.toUpperCase()})` : "";
        const hardsubLabel = server.hardsub ? "(Hardsub)" : "";

        try {
          const dec = await decryptFlixServer(server.dataLink);

          // Merge subtitle tracks
          if (Array.isArray(dec.subtitles)) {
            for (const s of dec.subtitles) {
              const key = `${s.lang}:${s.url}`;
              if (!subLanguagesSeen.has(key)) {
                subLanguagesSeen.add(key);
                subtitles.push(s);
              }
            }
          }

          const reqCat = category ? String(category).toLowerCase() : null;
          const isDub = (server.dataType || "").toLowerCase() === "dub";
          const streamType = reqCat || (isDub ? "dub" : "sub");
          const isDubFlag = reqCat === "sub" ? false : (reqCat === "dub" ? true : isDub);

          return {
            name: `Re:ANIME ${serverLabel} ${typeLabel} ${hardsubLabel}`.trim(),
            quality: "1080p (Flixcloud)",
            url: dec.streamUrl,
            isM3U8: true,
            headers: {
              Referer: "https://flixcloud.cc/",
              Origin: "https://flixcloud.cc",
              "User-Agent": USER_AGENT,
            },
            lang: streamType,
            type: streamType,
            isDub: isDubFlag,
          };
        } catch (decErr) {
          console.warn(`Failed to decrypt server ${serverLabel}:`, decErr.message);
          return null;
        }
      });

      const settled = await Promise.allSettled(serverTasks);
      for (const res of settled) {
        if (res.status === "fulfilled" && res.value) {
          sources.push(res.value);
        }
      }
    }
  } catch (err) {
    console.error("Re:ANIME fetchEpisodeSources error:", err.message);
  }

  return { sources, subtitles };
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
  name: "reanime",
  version: "1.0.4",
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
