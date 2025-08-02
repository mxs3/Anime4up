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

    const multiStreams = [];

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://witanime.com"
    };

    const serverMatches = [...html.matchAll(
        /<a[^>]+data-server-id=["']?(\d+)["']?[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi
    )];

    for (const [, , serverNameRaw] of serverMatches) {
        const title = serverNameRaw.toLowerCase().trim();
        const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (!iframeMatch) continue;

        let embedUrl = iframeMatch[1];
        if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

        let stream = null;

        if (title.includes("streamwish")) {
            stream = await streamwishExtractor(embedUrl, headers);
        } else if (title.includes("videa")) {
            stream = await videaExtractor(embedUrl, headers);
        } else if (title.includes("dailymotion")) {
            stream = await dailymotionExtractor(embedUrl, headers);
        } else if (title.includes("yourupload")) {
            stream = await yourUploadExtractor(embedUrl, headers);
        } else if (title.includes("ok.ru")) {
            stream = await okruExtractor(embedUrl, headers);
        } else if (title.includes("yonaplay")) {
            stream = await yonaplayExtractor(embedUrl, headers);
        }

        if (stream) {
            multiStreams.push({
                title: serverNameRaw,
                ...stream
            });
        }
    }

    if (multiStreams.length === 0) return 'https://files.catbox.moe/avolvc.mp4';
    if (multiStreams.length === 1) return multiStreams[0].streamUrl;

    return multiStreams;
}

// -------------- Extractor Helpers --------------

function tryUnpack(html) {
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d[\s\S]+?\)\)/);
    if (!evalMatch) return html;
    try {
        return unpack(evalMatch[0]);
    } catch {
        return html;
    }
}

async function streamwishExtractor(url, headers) {
    const res = await fetchv2(url, headers);
    const html = await res.text();
    const unpacked = tryUnpack(html);
    const match = unpacked.match(/https?:\/\/[^"']+\.m3u8/);
    if (match) return { streamUrl: match[0], headers };
    return null;
}

async function videaExtractor(url, headers) {
    const res = await fetchv2(url, headers);
    const html = await res.text();
    const fileMatch = html.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i);
    if (fileMatch) return { streamUrl: fileMatch[1], headers };
    const unpacked = tryUnpack(html);
    const match = unpacked.match(/https?:\/\/[^"']+\.m3u8/);
    if (match) return { streamUrl: match[0], headers };
    return null;
}

async function dailymotionExtractor(url, headers) {
    const res = await fetchv2(url, headers);
    const html = await res.text();
    const match = html.match(/"qualities":({.*?})\s*,\s*"report"/s);
    if (!match) return null;
    try {
        const json = JSON.parse(match[1]);
        const quality = json.auto?.[0]?.url || json['720']?.[0]?.url || json['480']?.[0]?.url;
        if (quality) return { streamUrl: quality, headers };
    } catch {}
    return null;
}

async function yourUploadExtractor(url, headers) {
    const res = await fetchv2(url, headers);
    const html = await res.text();
    const match = html.match(/player\.src\(\{\s*type:\s*['"]video\/mp4['"],\s*src:\s*['"]([^'"]+)['"]/);
    if (match) return { streamUrl: match[1], headers };
    return null;
}

async function okruExtractor(url, headers) {
    const okHeaders = {
        ...headers,
        "Origin": "https://ok.ru"
    };
    const res = await fetchv2(url, okHeaders);
    const html = await res.text();
    const match = html.match(/data-options="([^"]+)"/);
    if (!match) return null;
    try {
        const decoded = decodeURIComponent(match[1]);
        const json = JSON.parse(decoded);
        const videos = json.flashvars.metadata;
        const best = Array.isArray(videos) ? videos.sort((a, b) => b.bitrate - a.bitrate)[0] : null;
        if (best) return { streamUrl: best.url, headers: okHeaders };
    } catch {}
    return null;
}

async function yonaplayExtractor(url, headers) {
    const res = await fetchv2(url, headers);
    const html = await res.text();
    const unpacked = tryUnpack(html);
    const match = unpacked.match(/https?:\/\/[^"']+\.m3u8/);
    if (match) return { streamUrl: match[0], headers };
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
