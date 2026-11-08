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

const cheerio = require("cheerio");

const baseUrl = "https://www.simply-hentai.com";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.simply-hentai.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("simply-hentai.com", "https://www.simply-hentai.com/");
  global.setDynamicReferer("images.sh-cdn.com", "https://www.simply-hentai.com/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function parseCards($) {
  const results = [];
  $("article").each((_, el) => {
    const a = $(el)
      .find("a.content-link, a[data-cover-trigger], a:has(.cover-slot), .cover-slot a, .info a")
      .first();
    let href = a.attr("href") || "";
    if (!href || href.startsWith("/series/")) {
      const allA = $(el).find("a").toArray();
      for (const item of allA) {
        const h = $(item).attr("href") || "";
        if (h && !h.startsWith("/series/") && !h.startsWith("/topics/") && !h.startsWith("/tag/")) {
          href = h;
          break;
        }
      }
    }

    const cleanId = href.replace(/^https?:\/\/[^\/]+\//, "").replace(/^\/+|\/+$/g, "");

    if (
      !cleanId ||
      cleanId === "series" ||
      cleanId.startsWith("series/") ||
      cleanId === "manga" ||
      cleanId.startsWith("tag/") ||
      cleanId.startsWith("artist/") ||
      cleanId.startsWith("topics/")
    ) {
      return;
    }

    const imgEl = $(el).find(".cover-slot img, img[src*='sh-cdn'], img").first();
    let img =
      imgEl.attr("data-src") ||
      imgEl.attr("src") ||
      imgEl.attr("data-lazy-src") ||
      null;

    if (img && (img.startsWith("data:") || img.includes("load_error") || img.includes("blank.gif"))) {
      img = imgEl.attr("data-src") || imgEl.attr("data-original") || null;
    }
    if (img && img.startsWith("//")) {
      img = "https:" + img;
    }

    let title =
      imgEl.attr("alt") ||
      $(el).find(".title, h3, h4").first().text().trim() ||
      a.attr("title") ||
      cleanId.split("/").pop().replace(/-/g, " ");

    title = title.replace(/\s+/g, " ").trim();

    if (cleanId && title && !results.some((r) => r.id === cleanId)) {
      results.push({
        id: cleanId,
        title,
        image: img,
      });
    }
  });
  return results;
}

function parseRscFallback(html) {
  const results = [];
  if (!html || typeof html !== "string") return results;
  const unescaped = html.replace(/\\"/g, '"').replace(/\\\//g, "/");
  const rscRegex =
    /href=["'](\/[^"' >]+)["'][^>]*?src=["'](https:\/\/images\.sh-cdn\.com\/[^"' >]+)["'](?:[^>]*?alt=["']([^"' >]*)["'])?/g;
  let m;
  while ((m = rscRegex.exec(unescaped)) !== null) {
    const href = m[1];
    const img = m[2];
    const alt = m[3] || "";
    const cleanId = href
      .replace(/^https?:\/\/[^\/]+\//, "")
      .replace(/^\/+|\/+$/g, "");
    if (
      !cleanId ||
      cleanId === "series" ||
      cleanId.startsWith("series/") ||
      cleanId === "manga" ||
      cleanId.startsWith("tag/") ||
      cleanId.startsWith("artist/") ||
      cleanId.startsWith("topics/") ||
      cleanId.includes("originals-banner")
    ) {
      continue;
    }
    if (!results.some((r) => r.id === cleanId)) {
      results.push({
        id: cleanId,
        title: alt || cleanId.split("/").pop().replace(/-/g, " "),
        image: img,
      });
    }
  }
  return results;
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

async function latestManga(page = 1, filters = {}) {
  const pageNum = normalizePage(
    page !== undefined && page !== null && (typeof page === "number" || typeof page === "string" || (typeof page === "object" && page.page !== undefined))
      ? page
      : filters
  );
  try {
    const url = `${baseUrl}/manga?page=${pageNum}`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);
    let results = parseCards($);
    if (results.length === 0) {
      results = parseRscFallback(html);
    }

    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: results.length > 0 ? pageNum + 1 : pageNum,
      hasNextPage: results.length > 0,
      results,
    };
  } catch (err) {
    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: pageNum,
      hasNextPage: false,
      results: [],
    };
  }
}

async function searchManga(query, page = 1, filters = {}) {
  const pageNum = normalizePage(
    page !== undefined && page !== null && (typeof page === "number" || typeof page === "string" || (typeof page === "object" && page.page !== undefined))
      ? page
      : filters
  );
  try {
    if (!query || !query.trim()) {
      return latestManga(pageNum);
    }
    const url = `${baseUrl}/search?query=${encodeURIComponent(
      query.trim()
    )}&page=${pageNum}`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);
    let results = parseCards($);
    if (results.length === 0) {
      results = parseRscFallback(html);
    }

    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: results.length > 0 ? pageNum + 1 : pageNum,
      hasNextPage: results.length > 0,
      results,
    };
  } catch (err) {
    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: pageNum,
      hasNextPage: false,
      results: [],
    };
  }
}

async function fetchMangaInfo(mangaId) {
  try {
    const cleanId = String(mangaId).trim().replace(/^\/+|\/+$/g, "");
    const url = `${baseUrl}/${cleanId}`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content") ||
      `Manga #${cleanId}`;

    const coverImg =
      $("img[src*='sh-cdn']").first().attr("src") ||
      $("meta[property='og:image']").attr("content") ||
      null;

    const genres = [];
    $("a[href*='/tag/']").each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const authors = [];
    $("a[href*='/artist/'], a[href*='/author/']").each((_, el) => {
      const a = $(el).text().trim();
      if (a && !authors.includes(a)) authors.push(a);
    });

    let description = $("meta[name='description']").attr("content") || "";

    return {
      id: cleanId,
      title,
      image: coverImg,
      description: description || `Tags: ${genres.slice(0, 8).join(", ")}`,
      authors,
      genres,
      status: "Completed",
      totalChapters: 1,
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
    const chapters = [
      {
        id: cleanId,
        number: 1,
        title: "Full Chapter",
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
    const cleanId = String(chapterId).trim().replace(/^\/+|\/+$/g, "");
    const url = `${baseUrl}/${cleanId}`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    const pages = [];
    $("img").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (src.includes("images.sh-cdn.com") && src.includes("thumb_")) {
        const full = src.replace("small_thumb_", "thumb_");
        if (!pages.includes(full)) {
          pages.push(full);
        }
      }
    });

    return pages.map((img, idx) => ({
      page: idx + 1,
      img,
    }));
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "simplyhentai",
  version: "1.0.3",
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
  subrequestHeaders: [
    {
      match: ["simply-hentai.com", "images.sh-cdn.com"],
      headers: {
        Referer: "https://www.simply-hentai.com/",
        Origin: "https://www.simply-hentai.com",
      },
    },
  ],
  getHeaders(url) {
    if (
      url &&
      (url.includes("simply-hentai.com") || url.includes("images.sh-cdn.com"))
    ) {
      return {
        Referer: "https://www.simply-hentai.com/",
        Origin: "https://www.simply-hentai.com",
      };
    }
    return {};
  },
  bypassDomains: ["simply-hentai.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
