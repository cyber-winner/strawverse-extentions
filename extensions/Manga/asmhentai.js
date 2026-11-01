/**
 * StrawVerse Extension - AsmHentai Scraper
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

const baseUrl = "https://asmhentai.com";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://asmhentai.com/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("asmhentai.com", "https://asmhentai.com/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function parseItems($) {
  const results = [];
  $(".preview_item, .image, .ov_item").each((_, el) => {
    const a = $(el).find("a[href*='/g/']").first();
    const href = a.attr("href");
    if (!href) return;
    const m = href.match(/\/g\/(\d+)/);
    if (!m) return;
    const id = m[1];

    const img = $(el).find("img[data-src*='images.asmhentai'], img[src*='images.asmhentai'], .image img").first();
    let image =
      img.attr("data-src") ||
      img.attr("src") ||
      img.attr("data-original") ||
      null;

    if (image && (image.startsWith("data:") || image.includes("load_error") || image.includes("/images/"))) {
      const fallbackImg = $(el).find("img[data-src*='images.asmhentai'], img[src*='images.asmhentai']").first();
      image = fallbackImg.attr("data-src") || fallbackImg.attr("src") || null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    let title =
      $(el).find("h2 a, .title a, h2").first().text().trim() ||
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
    (totalPages ? currentPage < totalPages : resultsLength >= 20);

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
    const results = parseItems($);
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
    const targetUrl = `${baseUrl}/search/?q=${encodeURIComponent(
      query.trim()
    )}&page=${page}`;
    const data = await getHtml(targetUrl);
    const $ = cheerio.load(data);
    const results = parseItems($);
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
      $("h1").first().text().trim() ||
      $("title").text().replace("» AsmHentai", "").trim();

    const coverImg = $(".cover img, .info img").first();
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
    $("li.tags a, a[href*='/tag/']").each((_, el) => {
      const t = $(el).find(".tag_name").text().trim() || $(el).text().trim();
      const cleanT = t.replace(/\s*\([\d,]+\)$/, "").replace(/\s*[\d,]+$/, "").trim();
      if (cleanT && cleanT !== "Tags" && !genres.includes(cleanT)) genres.push(cleanT);
    });

    const artists = [];
    $("li.artists a, a[href*='/artist/']").each((_, el) => {
      const a = $(el).find(".tag_name").text().trim() || $(el).text().trim();
      const cleanA = a.replace(/\s*\([\d,]+\)$/, "").replace(/\s*[\d,]+$/, "").trim();
      if (cleanA && cleanA !== "Artists" && !artists.includes(cleanA)) artists.push(cleanA);
    });

    const groups = [];
    $("li.groups a, a[href*='/group/']").each((_, el) => {
      const g = $(el).find(".tag_name").text().trim() || $(el).text().trim();
      const cleanG = g.replace(/\s*\([\d,]+\)$/, "").replace(/\s*[\d,]+$/, "").trim();
      if (cleanG && cleanG !== "Groups" && !groups.includes(cleanG)) groups.push(cleanG);
    });
    const author = artists.join(", ") || groups.join(", ") || "Unknown";

    const type =
      $("li.categories a, a[href*='/category/']").first().text().trim() ||
      "Doujinshi";

    const parodies = [];
    $("li.parodies a, a[href*='/parody/']").each((_, el) => {
      const p = $(el).find(".tag_name").text().trim() || $(el).text().trim();
      const cleanP = p.replace(/\s*\d+$/, "").trim();
      if (cleanP && !parodies.includes(cleanP)) parodies.push(cleanP);
    });

    const characters = [];
    $("li.characters a, a[href*='/character/']").each((_, el) => {
      const c = $(el).find(".tag_name").text().trim() || $(el).text().trim();
      const cleanC = c.replace(/\s*\d+$/, "").trim();
      if (cleanC && !characters.includes(cleanC)) characters.push(cleanC);
    });

    let pagesCount = "";
    const pMatch = data.match(/(\d+)\s+pages/i) || data.match(/Pages:\s*(\d+)/i);
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
    const readerHtml = await getHtml(`${baseUrl}/gallery/${cleanId}/1/`);
    const $ = cheerio.load(readerHtml);

    const pagesVal =
      $("#pages, input[name='pages']").val() ||
      $("#load_pages, input[name='load_pages']").val() ||
      "0";
    const totalPages = parseInt(pagesVal, 10);

    const dir =
      $("#image_dir, input[name='image_dir']").val() ||
      $("#load_dir, input[name='load_dir']").val() ||
      "";

    const gid =
      $("#gallery_id, input[name='gallery_id']").val() ||
      cleanId;

    const firstImg =
      $("img.lazy, .image_container img, img#fimg, img#gimg")
        .first()
        .attr("data-src") || "";

    let ext = "jpg";
    if (firstImg.includes(".webp")) ext = "webp";
    else if (firstImg.includes(".png")) ext = "png";

    const pages = [];
    if (totalPages > 0 && dir && gid) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push({
          page: i,
          img: `https://images.asmhentai.com/${dir}/${gid}/${i}.${ext}`,
        });
      }
    }

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "asmhentai",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: ["asmhentai.com"],
      headers: {
        Referer: "https://asmhentai.com/",
        Origin: "https://asmhentai.com",
      },
    },
  ],
  bypassDomains: ["asmhentai.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
