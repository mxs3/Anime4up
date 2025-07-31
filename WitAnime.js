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
  if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

  const headers = {
    'User-Agent': 'Mozilla/5.0',
  };

  const multiStreams = {
    streams: [],
    subtitles: null
  };

  // جمع كل السيرفرات المفعلة في الصفحة
  const matches = [...html.matchAll(/<iframe[^>]+src=["'](https:\/\/(?:www\.)?(videa\.hu|dailymotion\.com|streamwish\.to|yourupload\.com)[^"']+)["']/gi)];

  if (matches.length === 0) return JSON.stringify({ streams: [], subtitles: null });

  // إنشاء قائمة خيارات
  const options = matches.map((m, i) => {
    const domain = m[2];
    let name = domain.split('.')[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);
    if (m[1].includes("FHD")) name += " - FHD";
    return `${i + 1}. ${name}`;
  }).join('\n');

  const index = parseInt(prompt(`❓ اختر السيرفر:\n${options}`)) - 1;
  if (isNaN(index) || index < 0 || index >= matches.length) return JSON.stringify({ streams: [], subtitles: null });

  const selectedUrl = matches[index][1];

  let stream = null;
  if (selectedUrl.includes('videa.hu')) {
    stream = await extractVidea(selectedUrl, headers);
  } else if (selectedUrl.includes('dailymotion.com')) {
    stream = await extractDailymotion(selectedUrl, headers);
  } else if (selectedUrl.includes('streamwish.to')) {
    stream = await extractStreamwish(selectedUrl, headers);
  } else if (selectedUrl.includes('yourupload.com')) {
    stream = await extractYourUpload(selectedUrl, headers);
  }

  if (stream) multiStreams.streams.push(stream);

  return JSON.stringify(multiStreams);
}

// ✅ Videa
async function extractVidea(url, headers = {}) {
  try {
    const res = await fetchv2(url, headers, 'GET');
    const html = await res.text();

    const sources = [];

    // ✅ 1. استخراج كل روابط MP4/generics formats:
    const mp4Matches = [...html.matchAll(/["']file["']\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/gi)];
    for (const match of mp4Matches) {
      const streamUrl = match[1];
      const isHLS = /\.m3u8/i.test(streamUrl);
      sources.push({
        title: isHLS ? 'HLS' : 'MP4',
        streamUrl,
        type: isHLS ? 'hls' : 'mp4',
        quality: streamUrl.includes('720') ? '720p' : streamUrl.includes('1080') ? '1080p' : 'SD',
        headers
      });
    }

    // ✅ 2. fallback: مباشرة m3u8 واضح في الصفحة
    const fallback = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i)?.[1];
    if (fallback && !sources.find(s => s.streamUrl === fallback)) {
      sources.push({
        title: 'Fallback HLS',
        streamUrl: fallback,
        type: 'hls',
        quality: 'Auto',
        headers
      });
    }

    return sources[0] ? sources[0] : null;
  } catch (err) {
    console.error("❌ Videa extractor failed:", err);
    return null;
  }
}

// ✅ Dailymotion
async function extractDailymotion(url, headers) {
  const res = await fetchv2(url, headers);
  const html = await res.text();
  const m3u8 = html.match(/https:\/\/[^"']+\.m3u8[^"']*/i)?.[0];
  if (m3u8) {
    return {
      title: 'Dailymotion',
      streamUrl: m3u8,
      type: 'hls',
      headers,
      subtitles: null
    };
  }
  return null;
}

// ✅ Streamwish
async function extractStreamwish(url, headers) {
  const res = await fetchv2(url, headers);
  const html = await res.text();
  const file = html.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i)?.[1];
  if (file) {
    return {
      title: 'Streamwish',
      streamUrl: file,
      type: file.includes('.m3u8') ? 'hls' : 'mp4',
      headers,
      subtitles: null
    };
  }
  return null;
}

// ✅ YourUpload
async function extractYourUpload(url, headers) {
  const res = await fetchv2(url, headers);
  const html = await res.text();
  const file = html.match(/<source\s+src=["']([^"']+\.mp4[^"']*)["']/i)?.[1];
  if (file) {
    return {
      title: 'YourUpload',
      streamUrl: file,
      type: 'mp4',
      headers,
      subtitles: null
    };
  }
  return null;
}

// ✅ دالة fetch v2
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
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
