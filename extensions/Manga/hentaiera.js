/**
 * StrawVerse Extension - HentaiEra Scraper
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

const baseUrl = "https://hentaiera.com";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://hentaiera.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("hentaiera.com", "https://hentaiera.com/");
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
      $(el).find(".gallery_title a, .g_title a").first().text().trim() ||
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
    totalPages,
    hasNextPage,
  };
}

async function latestManga(page = 1) {
  try {
    const targetUrl = page > 1 ? `${baseUrl}/?page=${page}` : `${baseUrl}/`;
    const data = await getHtml(targetUrl);
    const $ = cheerio.load(data);
    const results = parseThumbs($);
    const { totalPages, hasNextPage } = parsePagination($, results.length, page);

    return {
      current_page: page,
      totalPages: totalPages,
      hasNextPage: hasNextPage,
      results: results,
    };
  } catch (err) {
    throw err;
  }
}

async function searchManga(query, page = 1) {
  try {
    if (!query || !query.trim()) {
      return latestManga(page);
    }
    const targetUrl = `${baseUrl}/search/?key=${encodeURIComponent(
      query.trim()
    )}&page=${page}`;
    const data = await getHtml(targetUrl);
    const $ = cheerio.load(data);
    const results = parseThumbs($);
    const { totalPages, hasNextPage } = parsePagination($, results.length, page);

    return {
      current_page: page,
      totalPages: totalPages,
      hasNextPage: hasNextPage,
      results: results,
    };
  } catch (err) {
    throw err;
  }
}

async function fetchMangaInfo(mangaId) {
  try {
    const cleanId = String(mangaId).replace(/[^0-9]/g, "");
    const data = await getHtml(`${baseUrl}/gallery/${cleanId}/`);
    const $ = cheerio.load(data);

    const title =
      $(".gallery_title, h1").first().text().trim() ||
      $("title").text().replace("» HentaiEra", "").trim();

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
    $("li.tags a.tag_btn, .tags a, a[href*='/tag/']").each((_, el) => {
      const t = $(el).find(".tag_name").text().trim() || $(el).text().trim();
      const cleanT = t.replace(/\s*\d+$/, "").trim();
      if (cleanT && !genres.includes(cleanT)) genres.push(cleanT);
    });

    const artists = [];
    $("li.artists a.tag_btn, .artists a, a[href*='/artist/']").each(
      (_, el) => {
        const a = $(el).find(".tag_name").text().trim() || $(el).text().trim();
        const cleanA = a.replace(/\s*\d+$/, "").trim();
        if (cleanA && !artists.includes(cleanA)) artists.push(cleanA);
      }
    );

    const groups = [];
    $("li.groups a.tag_btn, .groups a, a[href*='/group/']").each((_, el) => {
      const g = $(el).find(".tag_name").text().trim() || $(el).text().trim();
      const cleanG = g.replace(/\s*\d+$/, "").trim();
      if (cleanG && !groups.includes(cleanG)) groups.push(cleanG);
    });
    const author = artists.join(", ") || groups.join(", ") || "Unknown";

    const type =
      $("li.categories a, a[href*='/category/']").first().text().trim() ||
      "Doujinshi";

    const parodies = [];
    $("li.parodies a.tag_btn, .parodies a, a[href*='/parody/']").each(
      (_, el) => {
        const p = $(el).find(".tag_name").text().trim() || $(el).text().trim();
        const cleanP = p.replace(/\s*\d+$/, "").trim();
        if (cleanP && !parodies.includes(cleanP)) parodies.push(cleanP);
      }
    );

    const characters = [];
    $("li.characters a.tag_btn, .characters a, a[href*='/character/']").each(
      (_, el) => {
        const c = $(el).find(".tag_name").text().trim() || $(el).text().trim();
        const cleanC = c.replace(/\s*\d+$/, "").trim();
        if (cleanC && !characters.includes(cleanC)) characters.push(cleanC);
      }
    );

    const pagesCount =
      $("#load_pages").val() || $(".pages").text().trim() || "";

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

    let server = $("#load_server").val() || "11";
    let dir = $("#load_dir").val() || "";
    let mediaId = $("#load_id").val() || "";
    let totalPages = parseInt($("#load_pages").val() || "0", 10);

    if (!dir || !mediaId) {
      const firstThumb =
        $(".inner_thumb img, .cover img").first().attr("data-src") || "";
      const m = firstThumb.match(
        /https?:\/\/(?:m|i)(\d+)\.hentaiera\.com\/([^\/]+)\/([^\/]+)\//
      );
      if (m) {
        server = m[1];
        dir = m[2];
        mediaId = m[3];
      }
    }

    let gth = null;
    const marker = "var g_th = $.parseJSON('";
    const startIdx = data.indexOf(marker);
    if (startIdx !== -1) {
      const endIdx = data.indexOf("');", startIdx + marker.length);
      if (endIdx !== -1) {
        try {
          gth = JSON.parse(data.substring(startIdx + marker.length, endIdx));
        } catch (_) {}
      }
    }

    const extMap = { j: "jpg", p: "png", b: "bmp", g: "gif", w: "webp" };
    const pages = [];

    if (gth && dir && mediaId) {
      const pageKeys = Object.keys(gth).sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10)
      );
      for (const p of pageKeys) {
        const code = (gth[p] || "").split(",")[0];
        const ext = extMap[code] || "webp";
        const num = parseInt(p, 10);
        pages.push({
          page: num,
          img: `https://m${server}.hentaiera.com/${dir}/${mediaId}/${num}.${ext}`,
        });
      }
    } else if (totalPages > 0 && dir && mediaId) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push({
          page: i,
          img: `https://m${server}.hentaiera.com/${dir}/${mediaId}/${i}.webp`,
        });
      }
    }

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hentaiera",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: ["hentaiera.com"],
      headers: {
        Referer: "https://hentaiera.com/",
        Origin: "https://hentaiera.com",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: ["hentaiera.com"],
      headers: {
        Referer: "https://hentaiera.com/",
        Origin: "https://hentaiera.com",
      },
    },
  ],
  getHeaders(url) {
    if (url && url.includes("hentaiera.com")) {
      return {
        Referer: "https://hentaiera.com/",
        Origin: "https://hentaiera.com",
      };
    }
    return {};
  },
  bypassDomains: ["hentaiera.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
