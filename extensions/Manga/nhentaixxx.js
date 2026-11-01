/**
 * StrawVerse Extension - nhentai.xxx Scraper
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

const baseUrl = "https://nhentai.xxx";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://nhentai.xxx/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("nhentai.xxx", "https://nhentai.xxx/");
  global.setDynamicReferer("nhentaimg.com", "https://nhentai.xxx/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function parseGalleryItems($) {
  const results = [];
  $(".gallery_item").each((_, el) => {
    const a = $(el).find("a[href*='/g/']").first();
    const href = a.attr("href") || $(el).find("a").attr("href");
    if (!href) return;
    const match = href.match(/\/g\/(\d+)/);
    if (!match) return;
    const id = match[1];

    const img = $(el).find("img").first();
    let image =
      img.attr("data-src") ||
      img.attr("src") ||
      img.attr("data-original") ||
      null;

    if (image && (image.startsWith("data:") || image.includes("load_error"))) {
      image = img.attr("data-src") || img.attr("data-original") || null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    let title =
      $(el).find(".caption").first().text().trim() ||
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
  $("ul.pagination li.page-item a.page-link").each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && (totalPages === null || num > totalPages)) {
      totalPages = num;
    }
  });

  const nextLink = $("ul.pagination a.page-link:contains('Next')").attr("href");
  const hasNextPage =
    Boolean(nextLink) || (totalPages ? currentPage < totalPages : resultsLength > 0);

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
    const results = parseGalleryItems($);
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
    const results = parseGalleryItems($);
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
    const data = await getHtml(`${baseUrl}/g/${cleanId}/`);
    const $ = cheerio.load(data);

    const title =
      $(".info h1").first().text().trim() ||
      $(".info h2").first().text().trim() ||
      $("title").text().replace("» nhentai", "").trim();

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
    $("li.tags:has(span.text:contains('Tags')) a.tag_btn .tag_name").each(
      (_, el) => {
        const t = $(el).text().trim();
        if (t && !genres.includes(t)) genres.push(t);
      }
    );

    const artists = [];
    $("li.tags:has(span.text:contains('Artists')) a.tag_btn .tag_name").each(
      (_, el) => {
        const a = $(el).text().trim();
        if (a && !artists.includes(a)) artists.push(a);
      }
    );

    const groups = [];
    $("li.tags:has(span.text:contains('Groups')) a.tag_btn .tag_name").each(
      (_, el) => {
        const g = $(el).text().trim();
        if (g && !groups.includes(g)) groups.push(g);
      }
    );
    const author = artists.join(", ") || groups.join(", ") || "Unknown";

    const type =
      $("li.tags:has(span.text:contains('Category')) a.tag_btn .tag_name")
        .first()
        .text()
        .trim() || "Doujinshi";

    const uploadedEl = $("li:has(span.text:contains('Uploaded')) span.uploaded");
    const released =
      uploadedEl.attr("data-utc") || uploadedEl.text().trim() || "";
    let year = null;
    if (released) {
      const yMatch = released.match(/\b(19\d\d|20\d\d)\b/);
      if (yMatch) year = parseInt(yMatch[1], 10);
    }

    const parodies = [];
    $("li.tags:has(span.text:contains('Parodies')) a.tag_btn .tag_name").each(
      (_, el) => {
        const p = $(el).text().trim();
        if (p && !parodies.includes(p)) parodies.push(p);
      }
    );

    const characters = [];
    $("li.tags:has(span.text:contains('Characters')) a.tag_btn .tag_name").each(
      (_, el) => {
        const c = $(el).text().trim();
        if (c && !characters.includes(c)) characters.push(c);
      }
    );

    const languages = [];
    $("li.tags:has(span.text:contains('Languages')) a.tag_btn .tag_name").each(
      (_, el) => {
        const l = $(el).text().trim();
        if (l && !languages.includes(l)) languages.push(l);
      }
    );

    const pagesCount = $("li:has(span.text:contains('Pages')) .pages")
      .text()
      .trim();

    const descParts = [];
    if (parodies.length) descParts.push("Parody: " + parodies.join(", "));
    if (characters.length) descParts.push("Characters: " + characters.join(", "));
    if (languages.length) descParts.push("Languages: " + languages.join(", "));
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
      released,
      year,
      status: "Completed",
    };
  } catch (err) {
    throw err;
  }
}

async function fetchChapters(mangaId) {
  try {
    const cleanId = String(mangaId).replace(/[^0-9]/g, "");
    return {
      TotalPages: 1,
      total: 1,
      Chapters: [
        {
          id: cleanId,
          number: 1,
          title: "Full Chapter",
        },
      ],
    };
  } catch (err) {
    return {
      TotalPages: 0,
      total: 0,
      Chapters: [],
    };
  }
}

async function fetchChapterPages(chapterId) {
  try {
    const cleanId = String(chapterId).replace(/[^0-9]/g, "");
    const data = await getHtml(`${baseUrl}/g/${cleanId}/`);
    const $ = cheerio.load(data);

    let server = $("#load_server").val() || $("#server_id").val() || "";
    let dir = $("#load_dir").val() || $("#image_dir").val() || "";
    let mediaId = $("#load_id").val() || $("#gallery_id").val() || "";
    let totalPages = parseInt(
      $("#load_pages").val() || $("#pages").val() || "0",
      10
    );

    if (!server || !dir || !mediaId) {
      const firstThumb =
        $("#thumbs_append img, .outer_thumbs img, .cover img")
          .first()
          .attr("data-src") || "";
      const m = firstThumb.match(
        /https?:\/\/i(\d+)\.nhentaimg\.com\/([^\/]+)\/([^\/]+)\//
      );
      if (m) {
        server = server || m[1];
        dir = dir || m[2];
        mediaId = mediaId || m[3];
      }
    }

    server = server || "5";

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

    if (gth && gth.fl && dir && mediaId) {
      const pageKeys = Object.keys(gth.fl).sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10)
      );
      for (const p of pageKeys) {
        const code = (gth.fl[p] || "").split(",")[0];
        const ext = extMap[code] || "webp";
        const num = parseInt(p, 10);
        pages.push({
          page: num,
          img: `https://i${server}.nhentaimg.com/${dir}/${mediaId}/${num}.${ext}`,
        });
      }
    } else if (totalPages > 0 && dir && mediaId) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push({
          page: i,
          img: `https://i${server}.nhentaimg.com/${dir}/${mediaId}/${i}.webp`,
        });
      }
    }

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "nhentaixxx",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: ["nhentai.xxx", "nhentaimg.com"],
      headers: {
        Referer: "https://nhentai.xxx/",
        Origin: "https://nhentai.xxx",
      },
    },
  ],
  bypassDomains: ["nhentai.xxx"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
