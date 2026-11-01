/**
 * StrawVerse Extension - HentaiFox Scraper
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

const baseUrl = "https://hentaifox.com";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hentaifox.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("hentaifox.com", "https://hentaifox.com/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function parseThumbs($) {
  const results = [];
  $(".thumb").each((_, el) => {
    const a = $(el).find(".inner_thumb a, a[href*='/gallery/']").first();
    const href = a.attr("href");
    if (!href) return;
    const m = href.match(/\/gallery\/(\d+)/);
    if (!m) return;
    const id = m[1];

    const img = $(el).find("img").first();
    let image =
      img.attr("data-src") ||
      img.attr("src") ||
      img.attr("data-original") ||
      null;

    if (image && (image.startsWith("data:") || image.includes("load_error"))) {
      image = img.attr("data-src") || null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    let title =
      $(el).find(".caption .g_title a, .g_title a").first().text().trim() ||
      a.attr("title") ||
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
    "ul.pagination a.page-link:contains('Next'), .pagination a:contains('Next')"
  ).attr("href");
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
    let targetUrl = `${baseUrl}/`;
    if (pageNum === 2) {
      targetUrl = `${baseUrl}/page/2/`;
    } else if (pageNum > 2) {
      targetUrl = `${baseUrl}/pag/${pageNum}/`;
    }

    const data = await getHtml(targetUrl);
    const $ = cheerio.load(data);
    const results = parseThumbs($);
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
    const targetUrl = `${baseUrl}/search/?q=${encodeURIComponent(
      query.trim()
    )}&page=${pageNum}`;
    const data = await getHtml(targetUrl);
    const $ = cheerio.load(data);
    const results = parseThumbs($);
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
    const cleanId = String(mangaId).replace(/[^0-9]/g, "");
    const data = await getHtml(`${baseUrl}/gallery/${cleanId}/`);
    const $ = cheerio.load(data);

    const title =
      $(".gallery_right h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().replace("» HentaiFox", "").trim();

    const coverImg = $(".cover img").first();
    let image =
      coverImg.attr("data-src") ||
      coverImg.attr("src") ||
      coverImg.attr("data-original") ||
      null;
    if (image && (image.startsWith("data:") || image.includes("load_error"))) {
      image = coverImg.attr("data-src") || null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    const genres = [];
    $(".tags a, .tag_btn, a[href*='/tag/']").each((_, el) => {
      const t = $(el)
        .text()
        .replace(/\s*\d+$/, "")
        .replace("Tags", "")
        .trim();
      if (t && !genres.includes(t)) genres.push(t);
    });

    const artists = [];
    $(".artists a, a[href*='/artist/'], a[href*='/artists/']").each(
      (_, el) => {
        const a = $(el)
          .text()
          .replace(/\s*\d+$/, "")
          .replace("Artists", "")
          .trim();
        if (a && !artists.includes(a)) artists.push(a);
      }
    );

    const groups = [];
    $(".groups a, a[href*='/group/'], a[href*='/groups/']").each((_, el) => {
      const g = $(el)
        .text()
        .replace(/\s*\d+$/, "")
        .replace("Groups", "")
        .trim();
      if (g && !groups.includes(g)) groups.push(g);
    });
    const author = artists.join(", ") || groups.join(", ") || "Unknown";

    const type =
      $(".g_type a, a[href*='/category/']").first().text().trim() ||
      "Doujinshi";

    const parodies = [];
    $(".parodies a, a[href*='/parody/']").each((_, el) => {
      const p = $(el)
        .text()
        .replace(/\s*\d+$/, "")
        .replace("Parodies", "")
        .trim();
      if (p && !parodies.includes(p)) parodies.push(p);
    });

    const characters = [];
    $(".characters a, a[href*='/character/']").each((_, el) => {
      const c = $(el)
        .text()
        .replace(/\s*\d+$/, "")
        .replace("Characters", "")
        .trim();
      if (c && !characters.includes(c)) characters.push(c);
    });

    const pagesCount =
      $("#load_pages").val() || $(".total_pages").text().trim() || "";

    const descParts = [];
    if (parodies.length) descParts.push("Parody: " + parodies.join(", "));
    if (characters.length)
      descParts.push("Characters: " + characters.join(", "));
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
    return {
      id: String(mangaId),
      title: `Gallery #${mangaId}`,
      image: null,
      description: "",
      genres: [],
      author: "Unknown",
      type: "Doujinshi",
      released: "",
      year: null,
      status: "Unknown",
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
    const galleryHtml = await getHtml(`${baseUrl}/gallery/${cleanId}/`);
    let $ = cheerio.load(galleryHtml);

    let loadDir = $("#load_dir").val();
    let loadId = $("#load_id").val();
    let totalPages = parseInt($("#load_pages").val() || "0", 10);

    const cover =
      $(".cover img").attr("data-src") || $(".cover img").attr("src") || "";
    const sMatch = cover.match(/https?:\/\/i(\d+)\.hentaifox\.com/);
    const server = sMatch ? sMatch[1] : "3";

    let ext = "webp";
    try {
      const readerHtml = await getHtml(`${baseUrl}/g/${cleanId}/1/`);
      $ = cheerio.load(readerHtml);
      const gimg =
        $("#gimg").attr("data-src") || $("#gimg").attr("src") || "";
      const extMatch = gimg.match(/\.([a-z0-9]+)(?:\?|$)/i);
      if (extMatch) ext = extMatch[1];
    } catch (_) {}

    const pages = [];
    if (totalPages > 0 && loadDir && loadId) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push({
          page: i,
          img: `https://i${server}.hentaifox.com/${loadDir}/${loadId}/${i}.${ext}`,
        });
      }
    }

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hentaifox",
  version: "1.0.1",
  baseUrl,
  headerRules: [
    {
      match: ["hentaifox.com"],
      headers: {
        Referer: "https://hentaifox.com/",
        Origin: "https://hentaifox.com",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: ["hentaifox.com"],
      headers: {
        Referer: "https://hentaifox.com/",
        Origin: "https://hentaifox.com",
      },
    },
  ],
  getHeaders(url) {
    if (url && url.includes("hentaifox.com")) {
      return {
        Referer: "https://hentaifox.com/",
        Origin: "https://hentaifox.com",
      };
    }
    return {};
  },
  bypassDomains: ["hentaifox.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
