async function searchResults(keyword) {
  try {
    const url = `https://witanime.world/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://witanime.world/'
      }
    });
    const html = await res.text();

    const results = [];
    const blocks = html.split('anime-card-container');
    for (const block of blocks) {
      const hrefMatch = block.match(/<a[^>]+href="([^"]+\/anime\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
      const titleMatch = block.match(/anime-card-title[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/i);

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

async function extractDetails(url) {
  try {
    const response = await fetchv2(url);
    const html = await response.text();

    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // ✅ الوصف من <p class="anime-story">
    const descMatch = html.match(/<p class="anime-story">\s*([\s\S]*?)\s*<\/p>/i);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    // ✅ التصنيفات من <ul class="anime-genres">...</ul>
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

    // ✅ سنة العرض من <span>بداية العرض:</span> 2025
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
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': url
      }
    });
    const html = await res.text();

    const typeMatch = html.match(/<div class="anime-info"><span>النوع:<\/span>\s*([^<]+)<\/div>/i);
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : "";

    if (type.includes("movie") || type.includes("فيلم")) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    const encoded = html.match(/var\s+encodedEpisodeData\s*=\s*['"]([^'"]+)['"]/);
    if (!encoded) return JSON.stringify([{ href: url, number: 1 }]);

    const decodedJson = atob(encoded[1]);
    const episodes = JSON.parse(decodedJson);

    for (const ep of episodes) {
      const number = parseInt(ep.number, 10);
      const href = ep.url.trim();
      if (!isNaN(number) && href) {
        results.push({ number, href });
      }
    }

    results.sort((a, b) => a.number - b.number);
    return JSON.stringify(results);
  } catch {
    return JSON.stringify([{ href: url, number: 1 }]);
  }
}

async function extractStreamUrl(html) {
  const fallback = 'https://files.catbox.moe/avolvc.mp4';
  if (!_0xCheck()) return fallback;

  try {
    // استخراج رابط streamwish فقط
    const match = [...html.matchAll(/onclick="player_iframe\.location\.href='([^']+)'[^>]*>\s*<a[^>]*>\s*<i[^>]*><\/i>\s*سيرفر المشاهدة\s*#?\d*/g)];

    // فلترة فقط سيرفرات streamwish
    const streamwishLinks = match
      .map(m => decodeHTMLEntities(m[1]))
      .filter(link => link.includes("streamwish"));

    if (!streamwishLinks.length) return fallback;

    const streams = [];

    for (const link of streamwishLinks) {
      const res = await soraFetch(link, {
        headers: { 'User-Agent': UA_IOS },
      });

      const embedHtml = await res.text();
      const urls = extractM3U8Urls(embedHtml);

      for (const url of urls) {
        streams.push({
          url,
          type: 'hls',
          quality: 'auto',
          original: url,
          headers: { 'Referer': link },
        });
      }
    }

    return streams.length ? streams : fallback;
  } catch (err) {
    return fallback;
  }
}

// فك تشفير روابط m3u8 من streamwish
function extractM3U8Urls(html) {
  const offsetMatch = html.match(/parseInt\(atob\([^)]+\)\[[^\]]+\]\(\/\\D\/g,''\)\)\s*-\s*(\d+)\)/);
  if (!offsetMatch) return [];
  const offset = parseInt(offsetMatch[1], 10);

  const arrayMatch = html.match(/var\s+hide_my_HTML_\w+\s*=\s*((?:'[^']*'(?:\s*\+\s*'[^']*')*\s*);)/);
  if (!arrayMatch) return [];

  const segments = arrayMatch[1]
    .replace(/'|\s/g, '')
    .replace(/\++/g, '')
    .split('.')
    .filter(Boolean);

  let decoded = '';
  for (const seg of segments) {
    try {
      const padded = seg + '='.repeat((4 - seg.length % 4) % 4);
      const num = parseInt(atob(padded).replace(/\D/g, ''), 10);
      if (!isNaN(num)) decoded += String.fromCharCode(num - offset);
    } catch {}
  }

  const urls = decoded.match(/https?:\/\/[^\s"'<>]+\.m3u8\b/gi) || [];
  return [...new Set(urls)];
}

// ✅ دالة fetch v2
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET');
  } catch {
    return { text: async () => '', json: async () => ({}) };
  }
}

// ✅ دالة التحقق
function _0xCheck() {
  var _0x1a = typeof _0xB4F2 === 'function';
  var _0x2b = typeof _0x7E9A === 'function';
  return _0x1a && _0x2b ? (function (_0x3c) {
    return _0x7E9A(_0x3c);
  })(_0xB4F2()) : !1;
}

// ✅ فك ترميز HTML
function decodeHTMLEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
