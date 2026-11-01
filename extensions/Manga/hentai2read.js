/**
 * StrawVerse Extension - Hentai2Read Scraper
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

const baseUrl = "https://hentai2read.com";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hentai2read.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("hentai2read.com", "https://hentai2read.com/");
  global.setDynamicReferer("hentaicdn.com", "https://hentai2read.com/");
}

async function getInertiaData(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, {
    headers: defaultHeaders,
    maxRedirects: 5,
  });

  const marker = '<script data-page="app" type="application/json">';
  const startIdx = typeof data === "string" ? data.indexOf(marker) : -1;
  if (startIdx !== -1) {
    const endIdx = data.indexOf("</script>", startIdx);
    if (endIdx !== -1) {
      try {
        return JSON.parse(data.substring(startIdx + marker.length, endIdx));
      } catch (_) {}
    }
  }
  return null;
}

function normalizeBook(item) {
  if (!item) return null;
  const rawUrl = item.url || "";
  const id = rawUrl.replace(/^\//, "") || String(item.id);
  const title = item.title || `Book #${item.id}`;
  const image = item.cover || null;

  return {
    id,
    title,
    image,
  };
}

async function latestManga(page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const url = `${baseUrl}/browse?page=${pageNum}`;
    const inertia = await getInertiaData(url);

    if (!inertia || !inertia.props) {
      return { results: [], page: 1, totalPages: 1, hasNextPage: false };
    }

    const booksObj = inertia.props.books || {};
    const list = Array.isArray(booksObj.data) ? booksObj.data : [];
    const results = list.map(normalizeBook).filter(Boolean);

    const totalPages = booksObj.lastPage || pageNum;
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
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&page=${pageNum}`;
    const inertia = await getInertiaData(url);

    if (!inertia || !inertia.props) {
      return { results: [], page: 1, totalPages: 1, hasNextPage: false };
    }

    const booksObj = inertia.props.books || {};
    const list = Array.isArray(booksObj.data) ? booksObj.data : [];
    const results = list.map(normalizeBook).filter(Boolean);

    const totalPages = booksObj.lastPage || pageNum;
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
    let cleanPath = String(mangaId).trim().replace(/^\//, "");
    if (!cleanPath.includes("/")) {
      cleanPath = `doujinshi/${cleanPath}`;
    }
    const url = `${baseUrl}/${cleanPath}`;
    const inertia = await getInertiaData(url);

    if (!inertia || !inertia.props || !inertia.props.book) {
      return {
        id: String(mangaId),
        title: `Book #${mangaId}`,
        image: null,
        description: "",
        authors: [],
        genres: [],
        status: "Unknown",
        totalChapters: 1,
      };
    }

    const book = inertia.props.book;
    const title = book.title || `Book #${book.id}`;
    const image = book.cover || null;
    const description = book.description || "";
    const tags = Array.isArray(book.tags) ? book.tags : [];
    const genres = tags.map((t) => t.name).filter(Boolean);

    const groups = Array.isArray(book.groups) ? book.groups : [];
    const authors = groups.map((g) => g.name).filter(Boolean);

    const chapters = Array.isArray(inertia.props.chapters)
      ? inertia.props.chapters
      : [];

    return {
      id: cleanPath,
      title,
      image,
      description,
      authors,
      genres,
      status: book.status || "Completed",
      totalChapters: chapters.length || 1,
    };
  } catch (err) {
    return {
      id: String(mangaId),
      title: `Book #${mangaId}`,
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
    let cleanPath = String(mangaId).trim().replace(/^\//, "");
    if (!cleanPath.includes("/")) {
      cleanPath = `doujinshi/${cleanPath}`;
    }
    const url = `${baseUrl}/${cleanPath}`;
    const inertia = await getInertiaData(url);

    if (inertia && inertia.props && Array.isArray(inertia.props.chapters)) {
      return inertia.props.chapters.map((chap) => ({
        id: (chap.url || "").replace(/^\//, "") || String(chap.id),
        title: chap.title || `Chapter ${chap.number || 1}`,
        chapterNumber: parseFloat(chap.number) || 1,
        releaseDate: chap.date || null,
      }));
    }

    return [
      {
        id: cleanPath,
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
    let cleanPath = String(chapterId).trim().replace(/^\//, "");
    if (!cleanPath.includes("/page-")) {
      cleanPath = `${cleanPath.replace(/\/+$/, "")}/page-1`;
    }
    const url = `${baseUrl}/${cleanPath}`;
    const inertia = await getInertiaData(url);

    if (inertia && inertia.props && Array.isArray(inertia.props.images)) {
      return inertia.props.images.map((img, idx) => ({
        page: idx + 1,
        img,
      }));
    }

    return [];
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hentai2read",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: ["hentai2read.com", "hentaicdn.com"],
      headers: {
        Referer: "https://hentai2read.com/",
        Origin: "https://hentai2read.com",
      },
    },
  ],
  bypassDomains: ["hentai2read.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
