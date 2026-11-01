/**
 * StrawVerse Extension - Hitomi.la Scraper
 * Copyright (C) 2026 cyber-winner
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * DISCLAIMER: This extension is intended for research, educational,
 * and developer testing purposes only. It functions as a client-side parser
 * of publicly available web pages. The developers do not host or distribute
 * any copyrighted media. Users are responsible for compliance with the terms of
 * service of the target website.
 */

const baseUrl = "https://hitomi.la";
const ltnBase = "https://ltn.gold-usergeneratedcontent.net";
const domain2 = "gold-usergeneratedcontent.net";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hitomi.la/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("hitomi.la", "https://hitomi.la/");
  global.setDynamicReferer("gold-usergeneratedcontent.net", "https://hitomi.la/");
}

let cachedGg = null;
let cachedGgTime = 0;

async function fetchGg() {
  const now = Date.now();
  if (cachedGg && now - cachedGgTime < 60000) {
    return cachedGg;
  }

  const axiosInstance = global.axios || require("axios");
  const { data: ggText } = await axiosInstance.get(`${ltnBase}/gg.js`, {
    headers: defaultHeaders,
  });

  const bMatch = typeof ggText === "string" ? ggText.match(/b:\s*['"]([^'"]+)['"]/) : null;
  const b = bMatch ? bMatch[1] : "";
  const cases = new Set(
    Array.from(ggText.matchAll(/case\s+(\d+):/g), (m) => parseInt(m[1], 10))
  );

  cachedGg = {
    b,
    s: (h) => {
      const m = /(..)(.)$/.exec(h);
      return m ? parseInt(m[2] + m[1], 16).toString(10) : "0";
    },
    m: (g) => (cases.has(g) ? 0 : 1),
  };
  cachedGgTime = now;
  return cachedGg;
}

function buildThumbnailUrl(hash, gg) {
  if (!hash || !gg) return "";
  const r = /\/[0-9a-f]{61}([0-9a-f]{2})([0-9a-f])/;
  const initialUrl = `https://a.${domain2}/webpbigtn/${hash}.webp`;
  const m = r.exec(initialUrl);
  const g = m ? parseInt(m[2] + m[1], 16) : 0;
  const sub = String.fromCharCode(97 + gg.m(g)) + "tn";
  const realPath = hash.replace(/^.*(..)(.)$/, "$2/$1/" + hash);
  return `https://${sub}.${domain2}/webpbigtn/${realPath}.webp`;
}

function buildImageUrl(hash, gg) {
  if (!hash || !gg) return "";
  const fullPath = `${gg.b}${gg.s(hash)}/${hash}`;
  const initialUrl = `https://a.${domain2}/${fullPath}.webp`;

  const r = /\/[0-9a-f]{61}([0-9a-f]{2})([0-9a-f])/;
  const m = r.exec(initialUrl);
  if (!m) return initialUrl;

  const g = parseInt(m[2] + m[1], 16);
  const sub = "w" + (1 + gg.m(g));
  return `https://${sub}.${domain2}/${fullPath}.webp`;
}

async function getGalleryInfo(id) {
  const axiosInstance = global.axios || require("axios");
  const cleanId = String(id).replace(/[^0-9]/g, "");
  const { data } = await axiosInstance.get(`${ltnBase}/galleries/${cleanId}.js`, {
    headers: defaultHeaders,
  });

  const marker = "var galleryinfo = ";
  const str = typeof data === "string" ? data : String(data);
  const startIdx = str.indexOf(marker);
  if (startIdx === -1) return null;

  const jsonStr = str.substring(startIdx + marker.length).trim().replace(/;$/, "");
  return JSON.parse(jsonStr);
}

async function readNozomiIds(url, page = 1, pageSize = 20) {
  const axiosInstance = global.axios || require("axios");
  const startByte = (page - 1) * pageSize * 4;
  const endByte = startByte + pageSize * 4 - 1;

  const response = await axiosInstance.get(url, {
    headers: {
      ...defaultHeaders,
      Range: `bytes=${startByte}-${endByte}`,
    },
    responseType: "arraybuffer",
  });

  const buf = Buffer.from(response.data);
  const ids = [];
  for (let i = 0; i < buf.length; i += 4) {
    if (i + 4 <= buf.length) {
      ids.push(buf.readUInt32BE(i));
    }
  }

  const contentRange = response.headers["content-range"] || "";
  let totalItems = 0;
  const rangeMatch = contentRange.match(/\/(\d+)/);
  if (rangeMatch) {
    totalItems = Math.floor(parseInt(rangeMatch[1], 10) / 4);
  }

  return { ids, totalItems };
}

async function latestManga(page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const pageSize = 20;
    const { ids, totalItems } = await readNozomiIds(
      `${ltnBase}/index-all.nozomi`,
      pageNum,
      pageSize
    );

    const gg = await fetchGg();
    const results = [];

    const promises = ids.map(async (id) => {
      try {
        const info = await getGalleryInfo(id);
        if (info) {
          const firstFile = info.files && info.files[0];
          const image = firstFile
            ? buildThumbnailUrl(firstFile.hash, gg)
            : null;
          return {
            id: String(id),
            title: info.title || info.japanese_title || `Gallery #${id}`,
            image,
          };
        }
      } catch (_) {}
      return null;
    });

    const resolved = await Promise.all(promises);
    for (const item of resolved) {
      if (item) results.push(item);
    }

    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : pageNum + 1;
    return {
      current_page: pageNum,
      page: pageNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      results,
    };
  } catch (err) {
    return { results: [], page: 1, totalPages: 1, hasNextPage: false };
  }
}

async function searchManga(query, page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const pageSize = 20;
    const cleanQuery = encodeURIComponent(
      query.trim().toLowerCase().replace(/\s+/g, "_")
    );

    let nozomiUrl = `${ltnBase}/n/tag/${cleanQuery}-all.nozomi`;
    let res = null;

    try {
      res = await readNozomiIds(nozomiUrl, pageNum, pageSize);
    } catch (_) {
      try {
        nozomiUrl = `${ltnBase}/n/series/${cleanQuery}-all.nozomi`;
        res = await readNozomiIds(nozomiUrl, pageNum, pageSize);
      } catch (_) {
        try {
          nozomiUrl = `${ltnBase}/n/artist/${cleanQuery}-all.nozomi`;
          res = await readNozomiIds(nozomiUrl, pageNum, pageSize);
        } catch (_) {}
      }
    }

    if (!res || !res.ids || res.ids.length === 0) {
      return { results: [], page: 1, totalPages: 1, hasNextPage: false };
    }

    const gg = await fetchGg();
    const results = [];

    const promises = res.ids.map(async (id) => {
      try {
        const info = await getGalleryInfo(id);
        if (info) {
          const firstFile = info.files && info.files[0];
          const image = firstFile
            ? buildThumbnailUrl(firstFile.hash, gg)
            : null;
          return {
            id: String(id),
            title: info.title || info.japanese_title || `Gallery #${id}`,
            image,
          };
        }
      } catch (_) {}
      return null;
    });

    const resolved = await Promise.all(promises);
    for (const item of resolved) {
      if (item) results.push(item);
    }

    const totalPages =
      res.totalItems > 0 ? Math.ceil(res.totalItems / pageSize) : pageNum;

    return {
      current_page: pageNum,
      page: pageNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      results,
    };
  } catch (err) {
    return {
      current_page: 1,
      page: 1,
      totalPages: 1,
      hasNextPage: false,
      results: [],
    };
  }
}

async function fetchMangaInfo(mangaId) {
  try {
    const cleanId = String(mangaId).replace(/[^0-9]/g, "");
    const info = await getGalleryInfo(cleanId);
    if (!info) {
      return {
        id: cleanId,
        title: `Gallery #${cleanId}`,
        image: null,
        description: "",
        authors: [],
        genres: [],
        status: "Unknown",
        totalChapters: 1,
      };
    }

    const gg = await fetchGg();
    const firstFile = info.files && info.files[0];
    const image = firstFile ? buildThumbnailUrl(firstFile.hash, gg) : null;

    const genres = (info.tags || []).map((t) => t.tag || t).filter(Boolean);
    const authors = (info.artists || []).map((a) => a.artist || a).filter(Boolean);

    let desc = `Type: ${info.type || "Doujinshi"} | Language: ${info.language || "Unknown"}`;
    if (info.date) desc += ` | Date: ${info.date}`;

    return {
      id: cleanId,
      title: info.title || info.japanese_title || `Gallery #${cleanId}`,
      image,
      description: desc,
      authors,
      genres,
      status: "Completed",
      totalChapters: 1,
    };
  } catch (err) {
    return {
      id: String(mangaId),
      title: `Gallery #${mangaId}`,
      image: null,
      description: "",
      authors: [],
      genres: [],
      status: "Unknown",
      totalChapters: 1,
    };
  }
}

async function fetchChapters(mangaId) {
  try {
    const cleanId = String(mangaId).replace(/[^0-9]/g, "");
    const chapters = [
      {
        id: cleanId,
        number: 1,
        title: "Chapter 1",
      },
    ];

    return {
      TotalPages: 1,
      totalPages: 1,
      total: 1,
      totalItems: 1,
      Chapters: chapters,
      chapters: chapters,
      hasNextPage: false,
    };
  } catch (err) {
    return {
      TotalPages: 0,
      totalPages: 0,
      total: 0,
      totalItems: 0,
      Chapters: [],
      chapters: [],
      hasNextPage: false,
    };
  }
}

async function fetchChapterPages(chapterId) {
  try {
    const cleanId = String(chapterId).replace(/[^0-9]/g, "");
    const info = await getGalleryInfo(cleanId);
    if (!info || !Array.isArray(info.files)) return [];

    const gg = await fetchGg();
    return info.files.map((file, idx) => ({
      page: idx + 1,
      img: buildImageUrl(file.hash, gg),
    }));
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hitomi",
  version: "1.0.1",
  baseUrl,
  headerRules: [
    {
      match: [
        "hitomi.la",
        "gold-usergeneratedcontent.net",
        "atn.gold-usergeneratedcontent.net",
        "btn.gold-usergeneratedcontent.net",
        "ltn.gold-usergeneratedcontent.net",
        "w1.gold-usergeneratedcontent.net",
        "w2.gold-usergeneratedcontent.net",
      ],
      headers: {
        Referer: "https://hitomi.la/",
        Origin: "https://hitomi.la",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: [
        "hitomi.la",
        "gold-usergeneratedcontent.net",
        "atn.gold-usergeneratedcontent.net",
        "btn.gold-usergeneratedcontent.net",
        "ltn.gold-usergeneratedcontent.net",
        "w1.gold-usergeneratedcontent.net",
        "w2.gold-usergeneratedcontent.net",
      ],
      headers: {
        Referer: "https://hitomi.la/",
        Origin: "https://hitomi.la",
      },
    },
  ],
  getHeaders(url) {
    if (
      url &&
      (url.includes("hitomi.la") ||
        url.includes("gold-usergeneratedcontent.net"))
    ) {
      return {
        Referer: "https://hitomi.la/",
        Origin: "https://hitomi.la",
      };
    }
    return {};
  },
  bypassDomains: [
    "hitomi.la",
    "gold-usergeneratedcontent.net",
    "atn.gold-usergeneratedcontent.net",
    "btn.gold-usergeneratedcontent.net",
    "ltn.gold-usergeneratedcontent.net",
  ],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
