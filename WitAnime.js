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

    const allowed = ["streamwish", "streamwish - sd", "videa", "dailymotion - fhd"];
    const regex = /<a[^>]+class="server-link"[^>]+data-server-id="(\d+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi;
    const matches = [...html.matchAll(regex)];
    const streams = [];

    for (const match of matches) {
        const id = match[1];
        const name = match[2].trim().toLowerCase();
        if (!allowed.includes(name)) continue;

        const iframeRegex = new RegExp(`<iframe[^>]+data-server="${id}"[^>]+src="([^"]+)"`, "i");
        const iframeMatch = html.match(iframeRegex);
        if (!iframeMatch) continue;

        const url = iframeMatch[1].startsWith("http") ? iframeMatch[1] : "https:" + iframeMatch[1];

        let extracted = [];
        if (name.includes("streamwish")) extracted = await extractStreamwish(url);
        else if (name === "videa") extracted = await extractVidea(url);
        else if (name === "dailymotion - fhd") extracted = await extractDailymotion(url);

        if (extracted.length) streams.push(...extracted);
    }

    if (!streams.length) {
        streams.push({
            title: "Fallback",
            streamUrl: "https://files.catbox.moe/avolvc.mp4",
            headers: {}
        });
    }

    return {
        streams,
        subtitles: ""
    };
}

async function extractStreamwish(url) {
    const res = await soraFetch(url);
    const html = await res.text();

    const evalMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?)<\/script>/);
    if (!evalMatch) return [];

    const unpacked = unpack(evalMatch[1]);

    const result = [];

    // HLS
    const hlsMatch = unpacked.match(/https:\/\/[^"']+\.m3u8/);
    if (hlsMatch) {
        result.push({
            title: "Streamwish (HLS)",
            streamUrl: hlsMatch[0],
            headers: {
                "Referer": "https://streamwish.to/",
                "User-Agent": defaultUA
            }
        });
    }

    // MP4
    const mp4s = [...unpacked.matchAll(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']\s*,\s*label\s*:\s*["']([^"']+)["']/g)];
    for (const [_, url, label] of mp4s) {
        result.push({
            title: `Streamwish - ${label}`,
            streamUrl: url,
            headers: {
                "Referer": "https://streamwish.to/",
                "User-Agent": defaultUA
            }
        });
    }

    return result;
}

async function extractVidea(url) {
    const res = await soraFetch(url);
    const html = await res.text();

    let iframeUrl = html.match(/<iframe[^>]+src="([^"]+videa[^"]+)"/i)?.[1];
    if (!iframeUrl) iframeUrl = url;
    if (!iframeUrl.startsWith("http")) iframeUrl = "https:" + iframeUrl;

    const res2 = await soraFetch(iframeUrl);
    const html2 = await res2.text();
    const fileMatch = html2.match(/sources:\s*\[\s*\{file:\s*"([^"]+\.mp4)"/);

    if (!fileMatch) return [];
    return [{
        title: "Videa (MP4)",
        streamUrl: fileMatch[1],
        headers: {
            "Referer": iframeUrl,
            "User-Agent": defaultUA
        }
    }];
}

async function extractDailymotion(url) {
    const videoId = url.match(/video\/([^?#]+)/)?.[1];
    if (!videoId) return [];

    const playerUrl = `https://geo.dailymotion.com/player/xtv3w.html?video=${videoId}`;
    const res = await soraFetch(playerUrl, {
        headers: {
            "User-Agent": iphoneUA,
            "Referer": "https://www.dailymotion.com/"
        }
    });

    const html = await res.text();
    const hlsMatch = html.match(/"url":"([^"]+\.m3u8[^"]*)"/);
    if (!hlsMatch) return [];

    const cleanUrl = hlsMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    return [{
        title: "Dailymotion - FHD",
        streamUrl: cleanUrl,
        headers: {
            "User-Agent": iphoneUA,
            "Referer": "https://geo.dailymotion.com/"
        }
    }];
}

const defaultUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (err) {
            return null;
        }
    }
}

// ✅ دالة fetch مخصصة
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET');
  } catch (err) {
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
