/**
 * StrawVerse Extension - ImHentai Scraper
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

const baseUrl = "https://imhentai.xxx";

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://imhentai.xxx/",
};

if (typeof global.setDynamicReferer === "function") {
  global.setDynamicReferer("imhentai.xxx", "https://imhentai.xxx/");
}

async function getHtml(url) {
  const axiosInstance = global.axios || require("axios");
  const { data } = await axiosInstance.get(url, { headers: defaultHeaders });
  return data;
}

function parseGalleryItems($) {
  const results = [];
  $(".thumb").each((_, el) => {
    const a = $(el).find("a[href*='/gallery/']").first();
    const href = a.attr("href") || $(el).find("a").attr("href");
    if (!href) return;
    const match = href.match(/\/gallery\/(\d+)/);
    if (!match) return;
    const id = match[1];

    const img = $(el)
      .find(".inner_thumb img, a[href*='/gallery/'] img, img.lazy")
      .first();
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
        image.includes("blank.gif") ||
        image.includes("uk_usa") ||
        image.includes("flag"))
    ) {
      image =
        img.attr("data-src") ||
        img.attr("data-original") ||
        img.attr("data-lazy-src") ||
        null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    } else if (image && image.startsWith("/")) {
      image = baseUrl + image;
    }

    let title =
      $(el)
        .find(".caption h2 a, .gallery_title, h2, h3, .caption")
        .first()
        .text()
        .trim() ||
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
    totalPages: totalPages || (hasNextPage ? currentPage + 1 : currentPage),
    hasNextPage,
  };
}

async function latestManga(page = 1) {
  try {
    const pageNum = parseInt(page, 10) || 1;
    const url =
      pageNum > 1 ? `${baseUrl}/?page=${pageNum}` : `${baseUrl}/`;

    const html = await getHtml(url);
    const $ = cheerio.load(html);
    const results = parseGalleryItems($);
    const { totalPages, hasNextPage } = parsePagination(
      $,
      results.length,
      pageNum
    );

    return {
      current_page: pageNum,
      page: pageNum,
      totalPages: totalPages || (results.length > 0 ? pageNum + 1 : pageNum),
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
    const url = `${baseUrl}/search/?key=${encodeURIComponent(
      query.trim()
    )}&page=${pageNum}`;

    const html = await getHtml(url);
    const $ = cheerio.load(html);
    const results = parseGalleryItems($);
    const { totalPages, hasNextPage } = parsePagination(
      $,
      results.length,
      pageNum
    );

    return {
      current_page: pageNum,
      page: pageNum,
      totalPages: totalPages || (results.length > 0 ? pageNum + 1 : pageNum),
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
    const url = `${baseUrl}/gallery/${cleanId}/`;
    const html = await getHtml(url);
    const $ = cheerio.load(html);

    let title =
      $(".gallery_right h1, h1.gallery_title, .gallery_title, h1")
        .first()
        .text()
        .trim();
    title = title.replace(/\s+/g, " ");

    const coverImg = $(
      ".left_cover img, .cover img, .gallery_first img"
    ).first();
    let image =
      coverImg.attr("data-src") ||
      coverImg.attr("data-original") ||
      coverImg.attr("data-lazy-src") ||
      coverImg.attr("src") ||
      null;
    if (
      image &&
      (image.startsWith("data:") ||
        image.includes("load_error") ||
        image.includes("blank.gif"))
    ) {
      image =
        coverImg.attr("data-src") ||
        coverImg.attr("data-original") ||
        coverImg.attr("data-lazy-src") ||
        null;
    }
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    } else if (image && image.startsWith("/")) {
      image = baseUrl + image;
    }

    const genres = [];
    $("ul.galleries_info a[href*='/tag/']").each((_, el) => {
      const g = $(el).text().replace(/\([0-9,.]+\)/, "").trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const authors = [];
    $(
      "ul.galleries_info a[href*='/artist/'], ul.galleries_info a[href*='/group/']"
    ).each((_, el) => {
      const a = $(el).text().replace(/\([0-9,.]+\)/, "").trim();
      if (a && !authors.includes(a)) authors.push(a);
    });

    let totalPages = 0;
    $("ul.galleries_info li").each((_, el) => {
      const text = $(el).text();
      if (text.includes("Pages:")) {
        const m = text.match(/Pages:\s*([0-9,]+)/i);
        if (m) {
          totalPages = parseInt(m[1].replace(/,/g, ""), 10);
        }
      }
    });

    return {
      id: cleanId,
      title: title || `Gallery #${cleanId}`,
      image,
      description: `Pages: ${totalPages || "Unknown"} | Tags: ${genres
        .slice(0, 10)
        .join(", ")}`,
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
    const url = `${baseUrl}/gallery/${cleanId}/`;
    const data = await getHtml(url);
    const $ = cheerio.load(data);

    let server = $("#load_server").val() || "";
    let dir = $("#load_dir").val() || "";
    let mediaId = $("#load_id").val() || "";
    const totalPages =
      parseInt($("#load_pages").val(), 10) ||
      parseInt($("#total_pages").val(), 10) ||
      0;

    if (!server || !dir || !mediaId) {
      const firstThumb =
        $(".thumb img, .inner_thumb img, .cover img")
          .first()
          .attr("data-src") || "";
      const m = firstThumb.match(
        /https?:\/\/m(\d+)\.imhentai\.xxx\/([^\/]+)\/([^\/]+)\//
      );
      if (m) {
        server = server || m[1];
        dir = dir || m[2];
        mediaId = mediaId || m[3];
      }
    }

    server = server || "11";

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
          img: `https://m${server}.imhentai.xxx/${dir}/${mediaId}/${num}.${ext}`,
        });
      }
    } else if (totalPages > 0 && dir && mediaId) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push({
          page: i,
          img: `https://m${server}.imhentai.xxx/${dir}/${mediaId}/${i}.webp`,
        });
      }
    }

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "imhentai",
  version: "1.0.2",
  baseUrl,
  headerRules: [
    {
      match: ["imhentai.xxx", "m1.imhentai.xxx", "m2.imhentai.xxx", "m3.imhentai.xxx", "m4.imhentai.xxx", "m5.imhentai.xxx", "m6.imhentai.xxx", "m7.imhentai.xxx", "m8.imhentai.xxx", "m9.imhentai.xxx", "m10.imhentai.xxx", "m11.imhentai.xxx"],
      headers: {
        Referer: "https://imhentai.xxx/",
        Origin: "https://imhentai.xxx",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: ["imhentai.xxx", "m1.imhentai.xxx", "m2.imhentai.xxx", "m3.imhentai.xxx", "m4.imhentai.xxx", "m5.imhentai.xxx", "m6.imhentai.xxx", "m7.imhentai.xxx", "m8.imhentai.xxx", "m9.imhentai.xxx", "m10.imhentai.xxx", "m11.imhentai.xxx"],
      headers: {
        Referer: "https://imhentai.xxx/",
        Origin: "https://imhentai.xxx",
      },
    },
  ],
  getHeaders(url) {
    if (url && url.includes("imhentai.xxx")) {
      return {
        Referer: "https://imhentai.xxx/",
        Origin: "https://imhentai.xxx",
      };
    }
    return {};
  },
  bypassDomains: ["imhentai.xxx"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
