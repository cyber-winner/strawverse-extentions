/**
 * StrawVerse Extension - Simply Hentai Scraper
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

const baseUrl = "https://www.simply-hentai.com";
const apiUrl = "https://api.simply-hentai.com/v3";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.simply-hentai.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("simply-hentai.com", "https://www.simply-hentai.com/");
  global.setDynamicReferer("images.sh-cdn.com", "https://www.simply-hentai.com/");
}

async function getJson(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function latestManga(page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const url = `${apiUrl}/tag/english?type=language&page=${pageNum}&sort=newest`;
    const json = await getJson(url);

    const albums = json?.data?.albums || [];
    const results = albums.map((alb) => ({
      id: alb.slug || String(alb.id),
      title: alb.title || `Album #${alb.id}`,
      image: alb.preview?.sizes?.thumb || alb.preview?.sizes?.small_thumb || null,
    }));

    const pagination = json?.pagination || {};
    const totalPages = pagination.pages || pageNum;
    return {
      results,
      page: pageNum,
      totalPages,
      hasNextPage: Boolean(pagination.next),
    };
  } catch (err) {
    return { results: [], page: 1, totalPages: 1, hasNextPage: false };
  }
}

async function searchManga(query, page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const url = `${apiUrl}/search/complex?query=${encodeURIComponent(query)}&page=${pageNum}`;
    const json = await getJson(url);

    const items = json?.data || [];
    const results = [];

    for (const item of items) {
      const obj = item.object || item;
      if (!obj) continue;
      const id = obj.slug || String(obj.id);
      const title = obj.title || `Item #${obj.id}`;
      const image = obj.preview?.sizes?.thumb || obj.preview?.sizes?.small_thumb || null;
      if (id && !results.some((r) => r.id === id)) {
        results.push({
          id,
          title,
          image,
        });
      }
    }

    const pagination = json?.pagination || {};
    const totalPages = pagination.pages || pageNum;
    return {
      results,
      page: pageNum,
      totalPages,
      hasNextPage: Boolean(pagination.next),
    };
  } catch (err) {
    return { results: [], page: 1, totalPages: 1, hasNextPage: false };
  }
}

async function fetchMangaInfo(mangaId) {
  try {
    const cleanId = String(mangaId).trim().replace(/^\/+|\/+$/g, "");
    let json = null;
    let isSeries = false;

    try {
      json = await getJson(`${apiUrl}/manga/${cleanId}`);
    } catch (_) {
      try {
        json = await getJson(`${apiUrl}/series/${cleanId}`);
        isSeries = true;
      } catch (_) {}
    }

    if (!json || !json.data) {
      return {
        id: cleanId,
        title: `Manga #${cleanId}`,
        image: null,
        description: "",
        authors: [],
        genres: [],
        status: "Unknown",
        totalChapters: 1,
      };
    }

    const data = json.data;
    const title = data.title || `Manga #${cleanId}`;
    const image =
      data.preview?.sizes?.full ||
      data.preview?.sizes?.giant_thumb ||
      data.preview?.sizes?.thumb ||
      null;

    const genres = (data.tags || []).map((t) => t.title || t.name).filter(Boolean);
    const artists = (data.artists || []).map((a) => a.title || a.name).filter(Boolean);

    let description = data.description || "";
    if (data.series && data.series.title) {
      description += (description ? "\n" : "") + `Series: ${data.series.title}`;
    }
    if (Array.isArray(data.characters) && data.characters.length > 0) {
      description += `\nCharacters: ${data.characters.map((c) => c.title || c.name).join(", ")}`;
    }

    let totalChapters = 1;
    if (isSeries && Array.isArray(data.albums)) {
      totalChapters = data.albums.length || 1;
    }

    return {
      id: cleanId,
      title,
      image,
      description: description.trim() || `Tags: ${genres.slice(0, 8).join(", ")}`,
      authors: artists,
      genres,
      status: "Completed",
      totalChapters,
    };
  } catch (err) {
    return {
      id: String(mangaId),
      title: `Manga #${mangaId}`,
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
    const cleanId = String(mangaId).trim().replace(/^\/+|\/+$/g, "");

    try {
      const seriesJson = await getJson(`${apiUrl}/series/${cleanId}`);
      if (seriesJson && seriesJson.data && Array.isArray(seriesJson.data.albums) && seriesJson.data.albums.length > 0) {
        return seriesJson.data.albums.map((alb, idx) => ({
          id: alb.slug || String(alb.id),
          title: alb.title || `Chapter ${idx + 1}`,
          chapterNumber: idx + 1,
          releaseDate: alb.created_at || null,
        }));
      }
    } catch (_) {}

    return [
      {
        id: cleanId,
        title: "Chapter 1",
        chapterNumber: 1,
        releaseDate: null,
      },
    ];
  } catch (err) {
    return [
      {
        id: String(mangaId),
        title: "Chapter 1",
        chapterNumber: 1,
        releaseDate: null,
      },
    ];
  }
}

async function fetchChapterPages(chapterId) {
  try {
    const cleanId = String(chapterId).trim().replace(/^\/+|\/+$/g, "");
    const json = await getJson(`${apiUrl}/manga/${cleanId}/pages`);
    const pages = json?.data?.pages || [];

    return pages.map((p) => ({
      page: p.page_num || 1,
      img: p.sizes?.full || p.sizes?.giant_thumb || p.sizes?.thumb || "",
    }));
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "simplyhentai",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: ["simply-hentai.com", "images.sh-cdn.com"],
      headers: {
        Referer: "https://www.simply-hentai.com/",
        Origin: "https://www.simply-hentai.com",
      },
    },
  ],
  bypassDomains: ["simply-hentai.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
