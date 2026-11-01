/**
 * StrawVerse Extension - HentaiRead Scraper
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

const baseUrl = "https://hentairead.com";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hentairead.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("hentairead.com", "https://hentairead.com/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function parseMangaItems($) {
  const results = [];
  $(".manga-item").each((_, el) => {
    const a = $(el).find("a.manga-item__link").first();
    const href = a.attr("href");
    if (!href) return;

    let id = href.replace(/^https?:\/\/[^\/]+\//, "").replace(/^\/+|\/+$/g, "");
    const title = $(el)
      .find(".manga-item__title, a.manga-item__link")
      .first()
      .text()
      .trim();

    const img = $(el).find("img").first();
    let image =
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      img.attr("data-cfsrc") ||
      img.attr("src") ||
      null;

    if (image && image.includes("srcset")) {
      const parts = image.split(" ");
      image = parts[0];
    }

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

  const nextLink = $("a[rel='next'], .pagination a.next").attr("href");
  const hasNextPage =
    Boolean(nextLink) ||
    (totalPages ? currentPage < totalPages : resultsLength > 0);

  return {
    totalPages: totalPages || (hasNextPage ? currentPage + 1 : currentPage),
    hasNextPage,
  };
}

async function latestManga(page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const pageSeg = pageNum > 1 ? `page/${pageNum}/` : "";
    const url = `${baseUrl}/hentai/${pageSeg}?sortby=new`;

    const html = await getHtml(url);
    const $ = cheerio.load(html);
    const results = parseMangaItems($);
    const { totalPages, hasNextPage } = parsePagination(
      $,
      results.length,
      pageNum
    );

    return {
      current_page: pageNum,
      page: pageNum,
      totalPages,
      hasNextPage,
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

async function searchManga(query, page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    if (!query || !query.trim()) {
      return latestManga(pageNum);
    }
    const pageSeg = pageNum > 1 ? `page/${pageNum}/` : "";
    const url = `${baseUrl}/${pageSeg}?s=${encodeURIComponent(
      query.trim()
    )}&title-type=contains`;

    const html = await getHtml(url);
    const $ = cheerio.load(html);
    const results = parseMangaItems($);
    const { totalPages, hasNextPage } = parsePagination(
      $,
      results.length,
      pageNum
    );

    return {
      current_page: pageNum,
      page: pageNum,
      totalPages,
      hasNextPage,
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
    let cleanId = String(mangaId).trim().replace(/^\/+|\/+$/g, "");
    if (!cleanId.startsWith("hentai/")) {
      cleanId = `hentai/${cleanId}`;
    }
    const url = `${baseUrl}/${cleanId}/`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content") ||
      `Hentai #${cleanId}`;

    const coverImg = $(
      ".manga-cover img, .item-thumb img, img.manga-post-image"
    ).first();
    let image =
      coverImg.attr("data-src") ||
      coverImg.attr("src") ||
      coverImg.attr("data-lazy-src") ||
      $("meta[property='og:image']").attr("content") ||
      null;

    if (image && image.startsWith("//")) image = "https:" + image;

    const genres = [];
    $("a[href*='/tag/'], a[href*='/category/']").each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const authors = [];
    $("a[href*='/artist/'], a[href*='/author/']").each((_, el) => {
      const a = $(el).text().trim();
      if (a && !authors.includes(a)) authors.push(a);
    });

    const description =
      $(".manga-excerpt, .entry-content, .manga-summary p")
        .first()
        .text()
        .trim() || `Tags: ${genres.slice(0, 8).join(", ")}`;

    return {
      id: cleanId,
      title,
      image,
      description,
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
    let cleanId = String(mangaId).trim().replace(/^\/+|\/+$/g, "");
    if (!cleanId.startsWith("hentai/")) {
      cleanId = `hentai/${cleanId}`;
    }
    const url = `${baseUrl}/${cleanId}/`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    const chapters = [];
    $("ul.chapters-list li, .chapter-list li, .sub-chap-list li").each(
      (_, el) => {
        const a = $(el).find("a").first();
        const href = a.attr("href");
        if (!href) return;

        let chapUrl = href
          .replace(/^https?:\/\/[^\/]+\//, "")
          .replace(/^\/+|\/+$/g, "");
        const chapTitle = a.text().trim();
        const numText = $(el).find(".chapter-number").text().trim();
        const num = parseFloat(numText) || chapters.length + 1;

        if (chapUrl && !chapters.some((c) => c.id === chapUrl)) {
          chapters.push({
            id: chapUrl,
            number: num,
            title: chapTitle || `Chapter ${num}`,
          });
        }
      }
    );

    if (chapters.length > 0) {
      chapters.sort((a, b) => a.number - b.number);
      return {
        TotalPages: 1,
        totalPages: 1,
        total: chapters.length,
        totalItems: chapters.length,
        Chapters: chapters,
        chapters: chapters,
        hasNextPage: false,
      };
    }

    const singleChapter = [
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
      Chapters: singleChapter,
      chapters: singleChapter,
      hasNextPage: false,
    };
  } catch (err) {
    let cleanId = String(mangaId).trim().replace(/^\/+|\/+$/g, "");
    if (!cleanId.startsWith("hentai/")) {
      cleanId = `hentai/${cleanId}`;
    }
    const fallback = [
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
      Chapters: fallback,
      chapters: fallback,
      hasNextPage: false,
    };
  }
}

async function fetchChapterPages(chapterId) {
  try {
    let cleanPath = String(chapterId).trim().replace(/^\/+|\/+$/g, "");
    if (!cleanPath.includes("/p/")) {
      cleanPath = `${cleanPath}/english/p/1`;
    }
    const url = `${baseUrl}/${cleanPath}/`;
    const html = await getHtml(url);

    let pageBaseUrl = "";
    const extraMatch = html.match(/var\s+chapterExtraData\s*=\s*(\{[^;]+\})/);
    if (extraMatch) {
      try {
        const parsed = JSON.parse(extraMatch[1]);
        pageBaseUrl = parsed.baseUrl || "";
      } catch (_) {}
    }

    if (!pageBaseUrl) {
      const baseMatch = html.match(/['"]baseUrl['"]\s*:\s*['"]([^'"]+)['"]/);
      if (baseMatch) {
        pageBaseUrl = baseMatch[1];
      }
    }

    let b64Data = "";
    const beforeMatch = html.match(/'(ey[A-Za-z0-9+/=]{20,})'/);
    if (beforeMatch) {
      b64Data = beforeMatch[1];
    } else {
      const scriptBefore = html.match(
        /id=['"]single-chapter-js-before['"][^>]*>([\s\S]*?)<\/script>/
      );
      if (scriptBefore) {
        const m = scriptBefore[1].match(/'(ey[A-Za-z0-9+/=]+)'/);
        if (m) b64Data = m[1];
      }
    }

    if (b64Data) {
      try {
        const decoded = Buffer.from(b64Data, "base64").toString("utf-8");
        const json = JSON.parse(decoded);
        const images = json?.data?.chapter?.images || [];
        return images.map((img, i) => {
          const src = img.src || img;
          const fullImg = pageBaseUrl
            ? `${pageBaseUrl.replace(/\/+$/, "")}/${src.replace(/^\/+/, "")}`
            : src;
          return {
            page: i + 1,
            img: fullImg,
          };
        });
      } catch (_) {}
    }

    const $ = cheerio.load(html);
    const pages = [];
    $("img.chapter-img, .reader-image img, #chapterImages img").each(
      (i, el) => {
        const src = $(el).attr("data-src") || $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          pages.push({
            page: i + 1,
            img: src,
          });
        }
      }
    );

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hentairead",
  version: "1.0.1",
  baseUrl,
  headerRules: [
    {
      match: ["hentairead.com"],
      headers: {
        Referer: "https://hentairead.com/",
        Origin: "https://hentairead.com",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: ["hentairead.com"],
      headers: {
        Referer: "https://hentairead.com/",
        Origin: "https://hentairead.com",
      },
    },
  ],
  getHeaders(url) {
    if (url && url.includes("hentairead.com")) {
      return {
        Referer: "https://hentairead.com/",
        Origin: "https://hentairead.com",
      };
    }
    return {};
  },
  bypassDomains: ["hentairead.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
