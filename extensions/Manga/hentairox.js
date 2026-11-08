/**
 * StrawVerse Extension - HentaiRox Scraper
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

const baseUrl = "https://hentairox.com";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hentairox.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("hentairox.com", "https://hentairox.com/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function parseArticles($) {
  const results = [];
  $("article").each((_, el) => {
    const a = $(el).find("a[href*='/gallery/']").first();
    const href = a.attr("href");
    if (!href) return;
    const m = href.match(/\/gallery\/(\d+)/);
    if (!m) return;
    const id = m[1];

    const img = $(el).find(".hr-home-card__cover img, .hr-gallery-card__cover img, .hr-home-card__media img, .thumb img, img[src*='thumb.jpg']").first();
    let image =
      img.attr("data-src") ||
      img.attr("src") ||
      img.attr("data-original") ||
      null;

    if (!image || image.includes("/assets/flags/")) {
      const fallbackImg = $(el).find("img:not([src*='flags'])").first();
      image = fallbackImg.attr("data-src") || fallbackImg.attr("src") || null;
    }

    if (image && (image.startsWith("data:") || image.includes("load_error"))) {
      image = img.attr("data-src") || null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    let title =
      $(el).find(".hr-home-card__title a, .hr-gallery-card__title a, h2 a, h2").first().text().trim() ||
      a.attr("aria-label") ||
      a.attr("title") ||
      img.attr("alt") ||
      "";

    title = title.replace(/\s+/g, " ").trim();

    if (title && id && !results.some((r) => r.id === id)) {
      results.push({
        id,
        title,
        image,
      });
    }
  });
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

function parsePagination($, resultsLength, currentPage) {
  let totalPages = null;
  $("ul.pagination li.page-item a.page-link, .pagination a").each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && (totalPages === null || num > totalPages)) {
      totalPages = num;
    }
  });

  const nextLink = $(
    "ul.pagination a.page-link:contains('Next'), .pagination a:contains('Next'), a:contains('Next')"
  ).attr("href");
  const hasNextPage =
    Boolean(nextLink) ||
    (totalPages ? currentPage < totalPages : resultsLength >= 20);

  return {
    totalPages,
    hasNextPage,
  };
}

async function latestManga(page = 1, filters = {}) {
  const pageNum = normalizePage(
    page !== undefined && page !== null && (typeof page === "number" || typeof page === "string" || (typeof page === "object" && page.page !== undefined))
      ? page
      : filters
  );
  try {
    const targetUrl = pageNum > 1 ? `${baseUrl}/?page=${pageNum}` : `${baseUrl}/`;
    const data = await getHtml(targetUrl);
    const $ = cheerio.load(data);
    const results = parseArticles($);
    const { totalPages, hasNextPage } = parsePagination($, results.length, pageNum);

    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: totalPages || (hasNextPage ? pageNum + 1 : pageNum),
      hasNextPage: Boolean(hasNextPage),
      results: results,
    };
  } catch (err) {
    return {
      currentPage: 1,
      current_page: 1,
      page: 1,
      totalPages: 1,
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
    const targetUrl = `${baseUrl}/search/?key=${encodeURIComponent(
      query.trim()
    )}&page=${pageNum}`;
    const data = await getHtml(targetUrl);
    const $ = cheerio.load(data);
    const results = parseArticles($);
    const { totalPages, hasNextPage } = parsePagination($, results.length, pageNum);

    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: totalPages || (hasNextPage ? pageNum + 1 : pageNum),
      hasNextPage: Boolean(hasNextPage),
      results: results,
    };
  } catch (err) {
    return {
      currentPage: 1,
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
    const data = await getHtml(`${baseUrl}/gallery/${cleanId}/`);
    const $ = cheerio.load(data);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().replace("» HentaiRox", "").trim();

    let image =
      $("img[src*='cover.jpg'], .cover img, .hr-gallery__cover img").first().attr("src") ||
      $("img[src*='1t.jpg'], img[src*='thumb.jpg']").first().attr("src") ||
      null;

    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    const genres = [];
    $("a[href*='/tag/']").each((_, el) => {
      const lines = $(el).text().split("\n").map((s) => s.trim()).filter(Boolean);
      const t = lines[0] || "";
      if (t && t !== "Tags" && !genres.includes(t)) genres.push(t);
    });

    const artists = [];
    $("a[href*='/artist/']").each((_, el) => {
      const lines = $(el).text().split("\n").map((s) => s.trim()).filter(Boolean);
      const a = lines[0] || "";
      if (a && a !== "Artists" && !artists.includes(a)) artists.push(a);
    });

    const groups = [];
    $("a[href*='/group/']").each((_, el) => {
      const lines = $(el).text().split("\n").map((s) => s.trim()).filter(Boolean);
      const g = lines[0] || "";
      if (g && g !== "Groups" && !groups.includes(g)) groups.push(g);
    });
    const author = artists.join(", ") || groups.join(", ") || "Unknown";

    const type =
      $("a[href*='/category/']").first().text().trim() || "Doujinshi";

    const parodies = [];
    $("a[href*='/parody/']").each((_, el) => {
      const p = $(el).text().replace(/\s*[\d,]+$/, "").trim();
      if (p && !parodies.includes(p)) parodies.push(p);
    });

    const characters = [];
    $("a[href*='/character/']").each((_, el) => {
      const c = $(el).text().replace(/\s*[\d,]+$/, "").trim();
      if (c && !characters.includes(c)) characters.push(c);
    });

    let pagesCount = "";
    const pMatch = data.match(/(\d+)\s+pages/i);
    if (pMatch) pagesCount = pMatch[1];

    const descParts = [];
    if (parodies.length) descParts.push("Parody: " + parodies.join(", "));
    if (characters.length) descParts.push("Characters: " + characters.join(", "));
    if (pagesCount) descParts.push("Pages: " + pagesCount);
    const description = descParts.join(" | ");

    return {
      id: cleanId,
      title,
      image,
      description,
      genres,
      author,
      type,
      released: "",
      year: null,
      status: "Completed",
    };
  } catch (err) {
    throw err;
  }
}

async function fetchChapters(mangaId) {
  try {
    const cleanId = String(mangaId).replace(/[^0-9]/g, "");
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
    const cleanId = String(chapterId).replace(/[^0-9]/g, "");
    const data = await getHtml(`${baseUrl}/gallery/${cleanId}/`);
    const $ = cheerio.load(data);

    let totalPages = 0;
    const pMatch = data.match(/(\d+)\s+pages/i);
    if (pMatch) totalPages = parseInt(pMatch[1], 10);

    let server = "11";
    let dir = "";
    let mediaId = "";

    const thumbImg = $("img[src*='thumb.jpg'], img[src*='cover.jpg'], img[src*='1t.jpg']")
      .first()
      .attr("src") || "";
    const m = thumbImg.match(
      /https?:\/\/(?:m|i)(\d+)\.hentairox\.com\/([^\/]+)\/([^\/]+)\//
    );
    if (m) {
      server = m[1];
      dir = m[2];
      mediaId = m[3];
    }

    const pages = [];
    if (totalPages > 0 && dir && mediaId) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push({
          page: i,
          img: `https://m${server}.hentairox.com/${dir}/${mediaId}/${i}.webp`,
        });
      }
    }

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hentairox",
  version: "1.0.3",
  baseUrl,
  headerRules: [
    {
      match: ["hentairox.com"],
      headers: {
        Referer: "https://hentairox.com/",
        Origin: "https://hentairox.com",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: ["hentairox.com"],
      headers: {
        Referer: "https://hentairox.com/",
        Origin: "https://hentairox.com",
      },
    },
  ],
  getHeaders(url) {
    if (url && url.includes("hentairox.com")) {
      return {
        Referer: "https://hentairox.com/",
        Origin: "https://hentairox.com",
      };
    }
    return {};
  },
  bypassDomains: ["hentairox.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
