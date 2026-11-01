/**
 * StrawVerse Extension - nhentai.net Scraper
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

const baseUrl = "https://nhentai.net";
const apiBase = "https://nhentai.net/api/v2";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://nhentai.net/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i1.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i2.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i3.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i4.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("t1.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("t2.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("t3.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("t4.nhentai.net", "https://nhentai.net/");
}

async function getJson(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function latestManga(page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const url = `${apiBase}/galleries?page=${pageNum}&per_page=25`;
    const data = await getJson(url);

    const items = data.result || [];
    const results = items.map((item) => ({
      id: String(item.id),
      title: item.english_title || item.japanese_title || `Gallery #${item.id}`,
      image: item.thumbnail ? `https://t1.nhentai.net/${item.thumbnail}` : null,
    }));

    const totalPages = data.num_pages || pageNum;
    return {
      results,
      page: pageNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
    };
  } catch (err) {
    return { results: [], page: 1, totalPages: 1, hasNextPage: false };
  }
}

async function searchManga(query, page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const url = `${apiBase}/search?query=${encodeURIComponent(query)}&page=${pageNum}`;
    const data = await getJson(url);

    const items = data.result || [];
    const results = items.map((item) => ({
      id: String(item.id),
      title: item.english_title || item.japanese_title || `Gallery #${item.id}`,
      image: item.thumbnail ? `https://t1.nhentai.net/${item.thumbnail}` : null,
    }));

    const totalPages = data.num_pages || pageNum;
    return {
      results,
      page: pageNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
    };
  } catch (err) {
    return { results: [], page: 1, totalPages: 1, hasNextPage: false };
  }
}

async function fetchMangaInfo(mangaId) {
  try {
    const cleanId = String(mangaId).replace(/[^0-9]/g, "");
    const url = `${apiBase}/galleries/${cleanId}`;
    const data = await getJson(url);

    const title =
      data.title?.english ||
      data.title?.japanese ||
      data.title?.pretty ||
      `Gallery #${cleanId}`;

    const coverPath = data.cover?.path || (data.thumbnail ? data.thumbnail.path : null);
    const image = coverPath ? `https://t1.nhentai.net/${coverPath}` : null;

    const tags = data.tags || [];
    const genres = tags.filter((t) => t.type === "tag").map((t) => t.name);
    const authors = tags
      .filter((t) => t.type === "artist" || t.type === "group")
      .map((t) => t.name);

    return {
      id: cleanId,
      title,
      image,
      description: `Pages: ${data.num_pages || 0} | Favorites: ${data.num_favorites || 0}`,
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
  const cleanId = String(mangaId).replace(/[^0-9]/g, "");
  return [
    {
      id: cleanId,
      title: "Chapter 1",
      chapterNumber: 1,
      releaseDate: null,
    },
  ];
}

async function fetchChapterPages(chapterId) {
  try {
    const cleanId = String(chapterId).replace(/[^0-9]/g, "");
    const url = `${apiBase}/galleries/${cleanId}`;
    const data = await getJson(url);

    if (Array.isArray(data.pages) && data.pages.length > 0) {
      return data.pages.map((p) => ({
        page: p.number,
        img: `https://i1.nhentai.net/${p.path}`,
      }));
    }

    const pages = [];
    const total = data.num_pages || 0;
    const mediaId = data.media_id;
    if (mediaId && total > 0) {
      for (let i = 1; i <= total; i++) {
        pages.push({
          page: i,
          img: `https://i1.nhentai.net/galleries/${mediaId}/${i}.webp`,
        });
      }
    }
    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "nhentainet",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: [
        "nhentai.net",
        "i1.nhentai.net",
        "i2.nhentai.net",
        "i3.nhentai.net",
        "i4.nhentai.net",
        "t1.nhentai.net",
        "t2.nhentai.net",
        "t3.nhentai.net",
        "t4.nhentai.net",
      ],
      headers: {
        Referer: "https://nhentai.net/",
        Origin: "https://nhentai.net",
      },
    },
  ],
  bypassDomains: ["nhentai.net"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
