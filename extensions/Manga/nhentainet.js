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

const cheerio = require("cheerio");

const baseUrl = "https://nhentai.net";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://nhentai.net/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i1.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i2.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("i3.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("t.nhentai.net", "https://nhentai.net/");
  global.setDynamicReferer("t1.nhentai.net", "https://nhentai.net/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function extractSvelteData(html, urlPattern) {
  const $ = cheerio.load(html);
  let parsed = null;
  $('script[type="application/json"][data-sveltekit-fetched]').each(
    (_, el) => {
      const dataUrl = $(el).attr("data-url") || "";
      if (dataUrl.includes(urlPattern)) {
        try {
          const raw = JSON.parse($(el).text());
          parsed =
            typeof raw.body === "string" ? JSON.parse(raw.body) : raw.body;
        } catch (_) {}
      }
    }
  );
  return parsed;
}

function parseDomGalleries($) {
  const results = [];
  $(".gallery").each((_, el) => {
    const a = $(el).find("a.cover").first();
    const href = a.attr("href") || "";
    const m = href.match(/\/g\/(\d+)/);
    if (!m) return;
    const id = m[1];

    const img = $(el).find("img").first();
    let image =
      img.attr("data-src") ||
      img.attr("data-original") ||
      img.attr("data-lazy-src") ||
      img.attr("src") ||
      null;

    if (
      image &&
      (image.startsWith("data:") ||
        image.includes("load_error") ||
        image.includes("blank.gif"))
    ) {
      image =
        img.attr("data-src") ||
        img.attr("data-original") ||
        img.attr("data-lazy-src") ||
        null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    const title =
      $(el).find(".caption").first().text().trim() || `Gallery #${id}`;

    if (id && !results.some((r) => r.id === id)) {
      results.push({
        id,
        title,
        image,
      });
    }
  });
  return results;
}

async function latestManga(page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const url = `${baseUrl}/?page=${pageNum}`;
    const html = await getHtml(url);

    const svelteData =
      extractSvelteData(html, `galleries?page=${pageNum}`) ||
      extractSvelteData(html, "galleries");
    let results = [];
    let totalPages = pageNum + 1;

    const items = Array.isArray(svelteData)
      ? svelteData
      : Array.isArray(svelteData?.result)
      ? svelteData.result
      : [];

    if (items.length > 0) {
      results = items.map((item) => ({
        id: String(item.id),
        title:
          item.english_title ||
          item.japanese_title ||
          item.title?.english ||
          item.title?.pretty ||
          `Gallery #${item.id}`,
        image: item.thumbnail
          ? `https://t1.nhentai.net/${item.thumbnail}`
          : item.cover?.path
          ? `https://t1.nhentai.net/${item.cover.path}`
          : null,
      }));
      totalPages = svelteData.num_pages || pageNum + 1;
    }

    if (results.length === 0) {
      const $ = cheerio.load(html);
      results = parseDomGalleries($);
      const lastPageText = $(".pagination .last, .pagination a").last().text();
      const parsedTotal = parseInt(lastPageText, 10);
      if (!isNaN(parsedTotal)) totalPages = parsedTotal;
    }

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

async function searchManga(query, page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    if (!query || !query.trim()) {
      return latestManga(pageNum);
    }
    const url = `${baseUrl}/search/?q=${encodeURIComponent(
      query.trim()
    )}&page=${pageNum}`;
    const html = await getHtml(url);

    const svelteData = extractSvelteData(html, "search");
    let results = [];
    let totalPages = pageNum + 1;

    const items = Array.isArray(svelteData)
      ? svelteData
      : Array.isArray(svelteData?.result)
      ? svelteData.result
      : [];

    if (items.length > 0) {
      results = items.map((item) => ({
        id: String(item.id),
        title:
          item.english_title ||
          item.japanese_title ||
          item.title?.english ||
          item.title?.pretty ||
          `Gallery #${item.id}`,
        image: item.thumbnail
          ? `https://t1.nhentai.net/${item.thumbnail}`
          : item.cover?.path
          ? `https://t1.nhentai.net/${item.cover.path}`
          : null,
      }));
      totalPages = svelteData.num_pages || pageNum + 1;
    }

    if (results.length === 0) {
      const $ = cheerio.load(html);
      results = parseDomGalleries($);
      const lastPageText = $(".pagination .last, .pagination a").last().text();
      const parsedTotal = parseInt(lastPageText, 10);
      if (!isNaN(parsedTotal)) totalPages = parsedTotal;
    }

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
    const url = `${baseUrl}/g/${cleanId}/`;
    const html = await getHtml(url);

    const svelteData = extractSvelteData(html, `galleries/${cleanId}`);

    if (svelteData && svelteData.id) {
      const title =
        svelteData.title?.english ||
        svelteData.title?.japanese ||
        svelteData.title?.pretty ||
        `Gallery #${cleanId}`;

      const coverPath =
        (typeof svelteData.cover === "string"
          ? svelteData.cover
          : svelteData.cover?.path) ||
        (typeof svelteData.thumbnail === "string"
          ? svelteData.thumbnail
          : svelteData.thumbnail?.path) ||
        null;
      const image = coverPath
        ? coverPath.startsWith("http")
          ? coverPath
          : `https://t1.nhentai.net/${coverPath.replace(/^\/+/, "")}`
        : null;

      const tags = Array.isArray(svelteData.tags) ? svelteData.tags : [];
      const genres = tags
        .filter((t) => t.type === "tag")
        .map((t) => t.name)
        .filter(Boolean);
      const authors = tags
        .filter((t) => t.type === "artist" || t.type === "group")
        .map((t) => t.name)
        .filter(Boolean);

      return {
        id: cleanId,
        title,
        image,
        description: `Pages: ${svelteData.num_pages || 0} | Favorites: ${
          svelteData.num_favorites || 0
        }`,
        authors,
        genres,
        status: "Completed",
        totalChapters: 1,
      };
    }

    const $ = cheerio.load(html);
    const title =
      $("#info h1").first().text().trim() ||
      $("title").text().replace("» nhentai: hentai manga doujinshi", "").trim();

    const coverImg = $("#cover img").first();
    let image = coverImg.attr("data-src") || coverImg.attr("src") || null;
    if (image && image.startsWith("//")) image = "https:" + image;

    const genres = [];
    $("a[href*='/tag/'] .name").each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const authors = [];
    $("a[href*='/artist/'] .name, a[href*='/group/'] .name").each((_, el) => {
      const a = $(el).text().trim();
      if (a && !authors.includes(a)) authors.push(a);
    });

    return {
      id: cleanId,
      title,
      image,
      description: `Tags: ${genres.slice(0, 8).join(", ")}`,
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
    const url = `${baseUrl}/g/${cleanId}/`;
    const html = await getHtml(url);

    const svelteData = extractSvelteData(html, `galleries/${cleanId}`);

    if (svelteData && Array.isArray(svelteData.pages)) {
      return svelteData.pages.map((p) => ({
        page: p.number || 1,
        img: `https://i.nhentai.net/${p.path}`,
      }));
    }

    const $ = cheerio.load(html);
    const pages = [];
    $(".thumb-container a.gallerythumb img").each((i, el) => {
      let src = $(el).attr("data-src") || $(el).attr("src") || "";
      if (src) {
        src = src.replace("t.nhentai.net", "i.nhentai.net").replace("t.", ".");
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
  name: "nhentainet",
  version: "1.0.2",
  baseUrl,
  headerRules: [
    {
      match: [
        "nhentai.net",
        "t.nhentai.net",
        "t1.nhentai.net",
        "t2.nhentai.net",
        "t3.nhentai.net",
        "i.nhentai.net",
        "i1.nhentai.net",
        "i2.nhentai.net",
        "i3.nhentai.net",
      ],
      headers: {
        Referer: "https://nhentai.net/",
        Origin: "https://nhentai.net",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: [
        "nhentai.net",
        "t.nhentai.net",
        "t1.nhentai.net",
        "t2.nhentai.net",
        "t3.nhentai.net",
        "i.nhentai.net",
        "i1.nhentai.net",
        "i2.nhentai.net",
        "i3.nhentai.net",
      ],
      headers: {
        Referer: "https://nhentai.net/",
        Origin: "https://nhentai.net",
      },
    },
  ],
  getHeaders(url) {
    if (url && url.includes("nhentai.net")) {
      return {
        Referer: "https://nhentai.net/",
        Origin: "https://nhentai.net",
      };
    }
    return {};
  },
  bypassDomains: [
    "nhentai.net",
    "t1.nhentai.net",
    "t2.nhentai.net",
    "t3.nhentai.net",
  ],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
