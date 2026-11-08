/**
 * StrawVerse Extension - HentaiForce Scraper
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

const baseUrl = "https://hentaiforce.me";
const fallbackBases = [
  "https://hentaiforce.net",
  "https://hentaiforce.com",
  "https://hentaiforce.org",
];

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hentaiforce.me/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("hentaiforce.me", "https://hentaiforce.me/");
  global.setDynamicReferer("m1.hentaiforce.me", "https://hentaiforce.me/");
  global.setDynamicReferer("hentaiforce.net", "https://hentaiforce.me/");
  global.setDynamicReferer("hentaiforce.com", "https://hentaiforce.me/");
  global.setDynamicReferer("hentaiforce.org", "https://hentaiforce.me/");
}

async function getHtmlWithFallback(path) {
  const axiosInstance = global.axios || require("axios");
  const urls = [baseUrl, ...fallbackBases].map(
    (b) => `${b.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
  );

  for (const url of urls) {
    try {
      const { data } = await axiosInstance.get(url, {
        headers: defaultHeaders,
        timeout: 8000,
      });
      if (
        data &&
        typeof data === "string" &&
        !data.includes("WordPress &rsaquo; Error")
      ) {
        return data;
      }
    } catch (_) {}
  }
  return "";
}

function parseItems($) {
  const results = [];

  $(".gallery, .manga-item, .thumb, article").each((_, el) => {
    const a = $(el)
      .find("a.gallery-thumb, a[href*='/view/'], a[href*='/gallery/']")
      .first();
    const href = a.attr("href") || $(el).find("a").first().attr("href");
    if (!href) return;

    const m = href.match(/\/(?:view|gallery)\/([^\/]+)/);
    const id = m
      ? m[1]
      : href
          .replace(/^https?:\/\/[^\/]+\//, "")
          .replace(/^\/+|\/+$/g, "");

    const img = $(el).find("img").first();
    let image =
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      img.attr("data-original") ||
      img.attr("src") ||
      null;

    if (image && (image.startsWith("data:") || image.includes("load_error") || image.includes("blank.gif"))) {
      image =
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        img.attr("data-original") ||
        null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    } else if (image && image.startsWith("/")) {
      image = "https://m1.hentaiforce.me" + image;
    }

    let title =
      $(el)
        .find(".caption, .title, .gallery-title, h2, h3, .text-left")
        .first()
        .text()
        .trim() ||
      a.attr("title") ||
      img.attr("alt") ||
      "";
    title = title.replace(/\s+/g, " ").trim();

    if (id && title && !results.some((r) => r.id === id)) {
      results.push({
        id,
        title,
        image,
      });
    }
  });

  return results;
}

function parsePagination($, resultsLength, currentPage) {
  let totalPages = null;
  $("ul.pagination a.page-link, .pagination a.page-numbers").each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && (totalPages === null || num > totalPages)) {
      totalPages = num;
    }
  });

  const nextLink = $(
    "a[rel='next'], .pagination a.next, a.page-link:contains('Next')"
  ).attr("href");
  const hasNextPage =
    Boolean(nextLink) ||
    (totalPages ? currentPage < totalPages : resultsLength > 0);

  return {
    totalPages: totalPages || (hasNextPage ? currentPage + 1 : currentPage),
    hasNextPage,
  };
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
    const path = pageNum > 1 ? `page/${pageNum}/` : "";
    const html = await getHtmlWithFallback(path);
    if (!html) {
      return {
        currentPage: pageNum,
        current_page: pageNum,
        page: pageNum,
        totalPages: 1,
        hasNextPage: false,
        results: [],
      };
    }

    const $ = cheerio.load(html);
    const results = parseItems($);
    const { totalPages, hasNextPage } = parsePagination(
      $,
      results.length,
      pageNum
    );

    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: totalPages || (hasNextPage ? pageNum + 1 : pageNum),
      hasNextPage: Boolean(hasNextPage),
      results,
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
    const path = `search?q=${encodeURIComponent(query.trim())}&page=${pageNum}`;
    const html = await getHtmlWithFallback(path);
    if (!html) {
      return {
        currentPage: pageNum,
        current_page: pageNum,
        page: pageNum,
        totalPages: 1,
        hasNextPage: false,
        results: [],
      };
    }

    const $ = cheerio.load(html);
    const results = parseItems($);
    const { totalPages, hasNextPage } = parsePagination(
      $,
      results.length,
      pageNum
    );

    return {
      currentPage: pageNum,
      current_page: pageNum,
      page: pageNum,
      totalPages: totalPages || (hasNextPage ? pageNum + 1 : pageNum),
      hasNextPage: Boolean(hasNextPage),
      results,
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
    const cleanId = String(mangaId).trim().replace(/^\/+|\/+$/g, "");
    const path = cleanId.includes("/") ? cleanId : `view/${cleanId}`;
    const html = await getHtmlWithFallback(path);
    if (!html) {
      return {
        id: cleanId,
        title: `Hentai #${cleanId}`,
        image: null,
        description: "",
        authors: [],
        genres: [],
        status: "Unknown",
        totalChapters: 1,
      };
    }

    const $ = cheerio.load(html);
    const title =
      $(".text-left.font-weight-bold, h1, .gallery-title").first().text().trim() ||
      `Hentai #${cleanId}`;

    const coverImg = $(
      "#gallery-main-cover img, .single-thumb img, .cover img"
    ).first();
    let image = coverImg.attr("data-src") || coverImg.attr("src") || null;
    if (image && image.startsWith("//")) image = "https:" + image;

    const genres = [];
    $("div.tag-container:contains('Tags:') a, a[href*='/tag/']").each(
      (_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      }
    );

    const authors = [];
    $("div.tag-container:contains('Artists:') a, a[href*='/artist/']").each(
      (_, el) => {
        const a = $(el).text().trim();
        if (a && !authors.includes(a)) authors.push(a);
      }
    );

    let description = "";
    $("div.tag-container:contains('Pages:')").each((_, el) => {
      description += $(el).text().trim() + "\n";
    });

    return {
      id: cleanId,
      title,
      image,
      description:
        description.trim() || `Tags: ${genres.slice(0, 8).join(", ")}`,
      authors,
      genres,
      status: "Completed",
      totalChapters: 1,
    };
  } catch (err) {
    return {
      id: String(mangaId),
      title: `Hentai #${mangaId}`,
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
    const cleanId = String(chapterId).trim().replace(/^\/+|\/+$/g, "");
    const path = cleanId.includes("/") ? cleanId : `view/${cleanId}`;
    const html = await getHtmlWithFallback(path);
    if (!html) return [];

    const pagesMatch = html.match(/readerPages\s*=\s*(\{[\s\S]*?\});/);
    if (pagesMatch) {
      try {
        const readerData = JSON.parse(pagesMatch[1]);
        const baseUri = readerData.baseUriImg || "";
        const pagesList = [];
        const total =
          readerData.lastPage ||
          (readerData.pages ? Object.keys(readerData.pages).length : 0);

        for (let i = 1; i <= total; i++) {
          const p = readerData.pages && readerData.pages[i];
          if (p && baseUri) {
            const img = baseUri.replace("%c", p.l).replace("%s", p.f);
            pagesList.push({ page: i, img });
          }
        }
        if (pagesList.length > 0) return pagesList;
      } catch (_) {}
    }

    const $ = cheerio.load(html);
    const pages = [];
    $(
      ".single-thumb img, .gallery-reader-img-wrapper img, .reader-image img"
    ).each((i, el) => {
      let src = $(el).attr("data-src") || $(el).attr("src") || "";
      if (src && !src.startsWith("data:")) {
        src = src
          .replace("t.jpg", ".jpg")
          .replace("t.webp", ".webp")
          .replace("t.png", ".png");
        if (src.startsWith("//")) src = "https:" + src;
        pages.push({
          page: i + 1,
          img: src,
        });
      }
    });

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hentaiforce",
  version: "1.0.3",
  baseUrl,
  headerRules: [
    {
      match: [
        "hentaiforce.me",
        "m1.hentaiforce.me",
        "hentaiforce.net",
        "hentaiforce.com",
        "hentaiforce.org",
      ],
      headers: {
        Referer: "https://hentaiforce.me/",
        Origin: "https://hentaiforce.me",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: [
        "hentaiforce.me",
        "m1.hentaiforce.me",
        "hentaiforce.net",
        "hentaiforce.com",
        "hentaiforce.org",
      ],
      headers: {
        Referer: "https://hentaiforce.me/",
        Origin: "https://hentaiforce.me",
      },
    },
  ],
  getHeaders(url) {
    if (url && (url.includes("hentaiforce") || url.includes("m1.hentaiforce"))) {
      return {
        Referer: "https://hentaiforce.me/",
        Origin: "https://hentaiforce.me",
      };
    }
    return {};
  },
  bypassDomains: [
    "hentaiforce.me",
    "m1.hentaiforce.me",
    "hentaiforce.net",
    "hentaiforce.com",
    "hentaiforce.org",
  ],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
