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
    const allowedServers = [
        "streamwish",
        "streamwish - sd",
        "streamwish - fhd",
        "videa",
        "videa - fhd",
        "dailymotion - fhd"
    ];

    const multiStreams = { streams: [], subtitles: null };

    const serverRegex = /<a[^>]+class="server-link"[^>]+data-server-id="(\d+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi;
    const matches = [...html.matchAll(serverRegex)];

    for (const match of matches) {
        const [_, id, name] = match;
        const serverName = name.trim().toLowerCase();
        if (!allowedServers.includes(serverName)) continue;

        const iframeRegex = new RegExp(`<iframe[^>]+data-server="${id}"[^>]+src="([^"]+)"`, "i");
        const iframeMatch = html.match(iframeRegex);
        if (!iframeMatch) continue;

        const iframeUrl = iframeMatch[1].startsWith("http") ? iframeMatch[1] : "https:" + iframeMatch[1];

        try {
            const extractor = getExtractor(serverName);
            const result = await extractor(iframeUrl);
            if (Array.isArray(result)) {
                multiStreams.streams.push(...result);
            }
        } catch (err) {
            console.log(`[${serverName}] Error:`, err.message);
        }
    }

    if (multiStreams.streams.length === 0) {
        multiStreams.streams.push({
            title: "Fallback",
            streamUrl: "https://files.catbox.moe/avolvc.mp4",
            headers: {}
        });
    }

    return JSON.stringify({
        streams: multiStreams.streams,
        subtitles: null
    });
}

function getExtractor(serverName) {
    const extractors = {
        "streamwish": streamwishExtractor,
        "streamwish - sd": streamwishExtractor,
        "streamwish - fhd": streamwishExtractor,
        "videa": videaExtractor,
        "videa - fhd": videaExtractor,
        "dailymotion - fhd": dailymotionExtractor
    };
    return extractors[serverName];
}

// ========== Extractors ==========
async function streamwishExtractor(url) {
    const headers = {
        "Referer": url,
        "User-Agent": defaultUA
    };

    const res = await soraFetch(url, { headers });
    const html = await res.text();

    const evalMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]+?)<\/script>/i);
    if (!evalMatch) return [];

    const unpacked = unpack(evalMatch[1]);
    const streams = [];

    const m3u8Match = unpacked.match(/file\s*:\s*"([^"]+\.m3u8)"/);
    if (m3u8Match) {
        streams.push({
            title: "Streamwish - HLS",
            streamUrl: m3u8Match[1],
            headers
        });
    }

    const mp4Matches = [...unpacked.matchAll(/file\s*:\s*"([^"]+\.mp4[^"]*)"\s*,\s*label\s*:\s*"([^"]+)"/g)];
    for (const [_, link, label] of mp4Matches) {
        streams.push({
            title: `Streamwish - ${label}`,
            streamUrl: link,
            headers
        });
    }

    return streams;
}

async function videaExtractor(url) {
    const headers = {
        "Referer": url,
        "User-Agent": defaultUA
    };

    const res = await soraFetch(url, { headers });
    const html = await res.text();

    let iframe = html.match(/<iframe[^>]+src="([^"]+videa[^"]+)"/i)?.[1] ?? url;
    if (!iframe.startsWith("http")) iframe = "https:" + iframe;

    const res2 = await soraFetch(iframe, { headers });
    const html2 = await res2.text();

    const match = html2.match(/sources:\s*\[\s*{file:\s*"([^"]+\.mp4)"/);
    if (!match) return [];

    return [{
        title: "Videa (MP4)",
        streamUrl: match[1],
        headers
    }];
}

async function dailymotionExtractor(url) {
    const videoId = url.match(/video\/([^?#]+)/)?.[1];
    if (!videoId) return [];

    const playerUrl = `https://geo.dailymotion.com/player/xtv3w.html?video=${videoId}`;
    const headers = {
        "User-Agent": iphoneUA,
        "Referer": "https://www.dailymotion.com/"
    };

    const res = await soraFetch(playerUrl, { headers });
    const html = await res.text();

    const hlsMatch = html.match(/"url":"([^"]+\.m3u8[^"]*)"/);
    if (!hlsMatch) return [];

    const cleanUrl = hlsMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');

    return [{
        title: "Dailymotion - FHD",
        streamUrl: cleanUrl,
        headers
    }];
}

// ========== Helpers ==========
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

class Unbaser {
    constructor(base) {
        this.base = base;
        this.dictionary = {};
        const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        [...ALPHABET.slice(0, base)].forEach((char, i) => {
            this.dictionary[char] = i;
        });
    }

    unbase(str) {
        return [...str].reverse().reduce((acc, char, i) => {
            return acc + (this.dictionary[char] * Math.pow(this.base, i));
        }, 0);
    }
}

function unpack(source) {
    const argsMatch = source.match(/}\s*\(\s*'([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/);
    if (!argsMatch) throw new Error("Unpack parse error");

    const payload = argsMatch[1];
    const base = parseInt(argsMatch[2]);
    const count = parseInt(argsMatch[3]);
    const symbols = argsMatch[4].split('|');

    if (symbols.length !== count) throw new Error("Symbol table mismatch");

    const unbaser = new Unbaser(base);
    const pattern = /\b\w+\b/g;
    return payload.replace(pattern, word => {
        const index = unbaser.unbase(word);
        return symbols[index] || word;
    });
}

const defaultUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/

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
