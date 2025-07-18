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

async function extractStreamUrl(url) {
  if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

  const multiStreams = {
    streams: [],
    subtitles: null
  };

  try {
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': url
      }
    });

    const html = await res.text();

    // استخراج روابط السيرفرات
    const serverRegex = /<a[^>]+data-ep-url="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = serverRegex.exec(html)) !== null) {
      const rawUrl = match[1].startsWith("//") ? "https:" + match[1] : match[1];
      const lower = rawUrl.toLowerCase();

      try {
        if (lower.includes("mp4upload")) {
          const stream = await mp4uploadExtractor(rawUrl);
          if (stream?.url) {
            const quality = getQualityFromUrlOrTitle(match[2]);
            multiStreams.streams.push({
              title: quality,
              streamUrl: stream.url,
              headers: stream.headers
            });
          }
        } else if (lower.includes("vidmoly")) {
          const stream = await vidmolyExtractor(rawUrl);
          if (stream?.url) {
            const quality = getQualityFromUrlOrTitle(match[2]);
            multiStreams.streams.push({
              title: quality,
              streamUrl: stream.url,
              headers: stream.headers
            });
          }
        }
      } catch (err) {
        console.error("Error extracting from server:", err);
      }
    }

    // fallback لو مفيش حاجه
    if (multiStreams.streams.length === 0) {
      multiStreams.streams.push({
        title: "SD (Fallback)",
        streamUrl: "https://files.catbox.moe/avolvc.mp4",
        headers: {}
      });
    }

    return JSON.stringify(multiStreams);
  } catch (err) {
    console.error("extractStreamUrl error:", err);
    return JSON.stringify({
      streams: [{
        title: "SD (Fallback)",
        streamUrl: "https://files.catbox.moe/avolvc.mp4",
        headers: {}
      }],
      subtitles: null
    });
  }
}

// ✅ استخراج جودة من الاسم أو الرابط
function getQualityFromUrlOrTitle(text) {
  const lower = text.toLowerCase();
  if (lower.includes("fhd") || lower.includes("1080")) return "FHD";
  if (lower.includes("hd") || lower.includes("720")) return "HD";
  if (lower.includes("sd") || lower.includes("480")) return "SD";
  return "SD";
}

// ✅ extractor mp4upload
async function mp4uploadExtractor(embedUrl) {
  const headers = {
    "Referer": embedUrl,
    "User-Agent": "Mozilla/5.0"
  };

  const res = await fetchv2(embedUrl, headers);
  const html = await res.text();

  const sources = html.match(/player\.src\("([^"]+\.mp4)"\)/);
  const url = sources ? sources[1] : null;

  return { url, headers };
}

// ✅ extractor vidmoly
async function vidmolyExtractor(embedUrl) {
  const headers = {
    "Referer": embedUrl,
    "User-Agent": "Mozilla/5.0"
  };

  const res = await fetchv2(embedUrl, headers);
  const html = await res.text();

  const match = html.match(/sources:\s*\[\s*\{\s*file:\s*"([^"]+\.mp4)"/);
  const url = match ? match[1] : null;

  return { url, headers };
}

// ✅ الفنكشن الأساسيه للحماية
function _0xCheck() {
    var _0x1a = typeof _0xB4F2 === 'function';
    var _0x2b = typeof _0x7E9A === 'function';
    return _0x1a && _0x2b ? (function(_0x3c) {
        return _0x7E9A(_0x3c);
    })(_0xB4F2()) : !1;
}

function _0x7E9A(_){return((___,____,_____,______,_______,________,_________,__________,___________,____________)=>(____=typeof ___,_____=___&&___[String.fromCharCode(...[108,101,110,103,116,104])],______=[...String.fromCharCode(...[99,114,97,110,99,105])],_______=___?[...___[String.fromCharCode(...[116,111,76,111,119,101,114,67,97,115,101])]()]:[],(________=______[String.fromCharCode(...[115,108,105,99,101])]())&&_______[String.fromCharCode(...[102,111,114,69,97,99,104])]((_________,__________)=>(___________=________[String.fromCharCode(...[105,110,100,101,120,79,102])](_________))>=0&&________[String.fromCharCode(...[115,112,108,105,99,101])](___________,1)),____===String.fromCharCode(...[115,116,114,105,110,103])&&_____===16&&________[String.fromCharCode(...[108,101,110,103,116,104])]===0))(_)}
