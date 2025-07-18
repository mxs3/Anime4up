// ✅ دالة فك ترميز الكيانات (HTML Entities) — نسخة واحدة فقط
function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#39;': "'"
  };
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}

// ✅ دالة البحث
async function searchResults(keyword) {
  try {
    const url = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://4s.qerxam.shop/'
      }
    });
    const html = await res.text();

    const results = [];
    const blocks = html.split('anime-card-container');
    for (const block of blocks) {
      const hrefMatch = block.match(/<a href="([^"]+\/anime\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
      const titleMatch = block.match(/anime-card-title[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/);

      if (hrefMatch && imgMatch && titleMatch) {
        results.push({
          title: decodeHTMLEntities(titleMatch[1]),
          href: hrefMatch[1],
          image: imgMatch[1]
        });
      }
    }

    if (results.length === 0) {
      return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
    }

    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([{ title: 'Error', href: '', image: '', error: err.message }]);
  }
}

// ✅ دالة استخراج التفاصيل
async function extractDetails(url) {
  try {
    const response = await fetchv2(url); // No headers needed
    const html = await response.text();

    // Fallback values
    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // ✅ الوصف
    const descMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/i);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    // ✅ التصنيفات
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

    // ✅ تاريخ العرض
    const airdateMatch = html.match(/<span>\s*بداية العرض:\s*<\/span>\s*(\d{4})/i);
    if (airdateMatch) {
      const extracted = airdateMatch[1].trim();
      if (/^\d{4}$/.test(extracted)) {
        airdate = extracted;
      }
    }

    return JSON.stringify([
      {
        description,
        aliases,
        airdate: `سنة العرض: ${airdate}`
      }
    ]);

  } catch (error) {
    console.error("extractDetails error:", error.message);
    return JSON.stringify([
      {
        description: "تعذر تحميل الوصف.",
        aliases: "غير مصنف",
        airdate: "سنة العرض: غير معروفة"
      }
    ]);
  }
}

async function extractEpisodes(url) {
  const results = [];

  try {
    const getPage = async (pageUrl) => {
      const res = await fetchv2(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": url
        }
      });
      return await res.text();
    };

    const firstHtml = await getPage(url);

    // ✅ تحقق النوع (movie vs series)
    const typeMatch = firstHtml.match(/<div class="anime-info"><span>النوع:<\/span>\s*([^<]+)<\/div>/i);
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : "";

    if (type.includes("movie") || type.includes("فيلم")) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    // ✅ استخراج روابط الصفحات كلها
    const paginationRegex = /<a[^>]+href="([^"]+\/page\/\d+\/?)"[^>]*class="page-numbers"/gi;
    const pagesSet = new Set();

    let match;
    while ((match = paginationRegex.exec(firstHtml)) !== null) {
      pagesSet.add(match[1]);
    }

    const pages = Array.from(pagesSet);
    pages.push(url); // ضيف الصفحة الأولى

    const htmlPages = await Promise.all(
      pages.map(page => getPage(page))
    );

    for (const html of htmlPages) {
      const episodeRegex = /<div class="episodes-card-title">\s*<h3>\s*<a\s+href="([^"]+)">[^<]*الحلقة\s*(\d+)[^<]*<\/a>/gi;
      let epMatch;
      while ((epMatch = episodeRegex.exec(html)) !== null) {
        const episodeUrl = epMatch[1].trim();
        const episodeNumber = parseInt(epMatch[2].trim(), 10);

        if (!isNaN(episodeNumber)) {
          results.push({
            href: episodeUrl,
            number: episodeNumber
          });
        }
      }
    }

    results.sort((a, b) => a.number - b.number);

    if (results.length === 0) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    return JSON.stringify(results);

  } catch (err) {
    console.error("extractEpisodes error:", err);
    return JSON.stringify([{ href: url, number: 1 }]);
  }
}

async function extractStreamUrls(url) {
  try {
    const response = await fetchv2(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": url
      }
    });

    const html = await response.text();
    const servers = [];

    // ✅ Regex 1: من <ul class="nav nav-tabs" ...>
    const navRegex = /<li[^>]*>\s*<a[^>]+data-ep-url="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = navRegex.exec(html)) !== null) {
      const rawUrl = match[1].startsWith("//") ? "https:" + match[1] : match[1];
      const label = match[2].toLowerCase();

      if (rawUrl.includes("mp4upload")) {
        if (label.includes("fhd")) servers.push({ url: rawUrl, quality: "FHD" });
        else if (label.includes("hd")) servers.push({ url: rawUrl, quality: "HD" });
        else if (label.includes("sd")) servers.push({ url: rawUrl, quality: "SD" });
        else servers.push({ url: rawUrl, quality: "SD" }); // fallback label
      }

      if (rawUrl.includes("vidmoly")) {
        if (label.includes("fhd")) servers.push({ url: rawUrl, quality: "FHD" });
        else if (label.includes("hd")) servers.push({ url: rawUrl, quality: "HD" });
        else if (label.includes("sd")) servers.push({ url: rawUrl, quality: "SD" });
        else servers.push({ url: rawUrl, quality: "SD" });
      }
    }

    // ✅ Regex 2: من <ul class="quality-list"> في <div class="panel-body">
    const qualityRegex = /<li>\s*<a[^>]+href="([^"]+)"[^>]*>\s*(?:mp4upload|vidmoly)[^<]*<\/a>/gi;
    const sectionRegex = /<li>\s*الجودة\s*(.*?)\s*<\/li>/gi;
    let lastQuality = "SD"; // default
    let sectionMatch;
    let htmlParts = html.split(/<ul class="quality-list">/gi);
    for (let i = 1; i < htmlParts.length; i++) {
      const part = htmlParts[i];
      sectionMatch = /<li>\s*الجودة\s*(.*?)\s*<\/li>/i.exec(part);
      if (sectionMatch) lastQuality = sectionMatch[1].toUpperCase().trim();

      let subMatch;
      while ((subMatch = qualityRegex.exec(part)) !== null) {
        const link = subMatch[1].trim();
        if (link.includes("mp4upload") || link.includes("vidmoly")) {
          servers.push({ url: link, quality: lastQuality });
        }
      }
    }

    // ✅ ترتيب حسب FHD > HD > SD
    servers.sort((a, b) => {
      const qualityOrder = { "FHD": 3, "HD": 2, "SD": 1 };
      return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
    });

    // ✅ fallback
    if (servers.length === 0) {
      return {
        streams: [
          { url: "https://files.catbox.moe/avolvc.mp4", name: "SD" }
        ],
        subtitles: null
      };
    }

    return {
      streams: servers.map(s => ({
        url: s.url,
        name: s.quality
      })),
      subtitles: null
    };

  } catch (err) {
    console.error("extractStreamUrls error:", err);
    return {
      streams: [
        { url: "https://files.catbox.moe/avolvc.mp4", name: "SD" }
      ],
      subtitles: null
    };
  }
}
