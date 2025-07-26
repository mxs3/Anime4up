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

async function extractStreamUrl(url) {
  if (!_0xCheck()) return fallbackStream();

  const html = await (await fetchv2(url)).text();
  const multiStreams = { streams: [], subtitles: null };

  const serverRegex = /<li[^>]+data-id=["'](\d+)["'][^>]+data-server=["']([^"']+)["']/g;
  const matches = [...html.matchAll(serverRegex)];
  const servers = matches.map(m => ({ id: m[1], server: m[2] }));

  for (const { id, server } of servers) {
    try {
      const res = await fetchv2(`https://witanime.world/ajax/embed.php?id=${id}`, {
        'X-Requested-With': 'XMLHttpRequest'
      });

      const json = await res.json();
      const iframeUrl = json?.src;
      if (!iframeUrl) continue;

      const extracted = await extractFromEmbed(iframeUrl, server);
      if (extracted) multiStreams.streams.push(extracted);

    } catch (err) {
      console.error(`[${server}] Fetch failed:`, err);
    }
  }

  if (!multiStreams.streams.length) multiStreams.streams.push(fallbackStream());

  return multiStreams;
}

function fallbackStream() {
  return {
    streamUrl: 'https://files.catbox.moe/avolvc.mp4',
    type: 'mp4',
    quality: 'fallback',
    original: 'fallback',
    server: 'fallback'
  };
}

async function extractFromEmbed(url, serverName) {
  try {
    const res = await fetchv2(url);
    const html = await res.text();

    if (url.includes("dailymotion")) {
      const id = url.match(/video\/([^/?]+)/)?.[1];
      if (!id) return null;
      const api = await fetchv2(`https://www.dailymotion.com/player/metadata/video/${id}`);
      const data = await api.json();
      const hls = data?.qualities?.auto?.[0]?.url;
      if (!hls) return null;
      return streamObj(hls, 'hls', serverName, url);

    } else if (url.includes("ok.ru")) {
      const match = html.match(/data-options="([^"]+)"/);
      if (!match) return null;
      const decoded = decodeURIComponent(match[1]);
      const parsed = JSON.parse(decoded);
      const meta = JSON.parse(parsed.flashvars?.metadata || "{}");
      const hls = meta.hls?.url || meta.hls4?.url;
      if (!hls) return null;
      return streamObj(hls, 'hls', serverName, url);

    } else if (url.includes("streamwish")) {
      const match = html.match(/sources:\s*\[\s*{file:\s*["']([^"']+)["']/);
      if (!match) return null;
      return streamObj(match[1], typeFromExt(match[1]), serverName, url);

    } else if (url.includes("upstream.to")) {
      const match = html.match(/sources:\s*\[\s*{file:\s*["']([^"']+)["']/);
      if (!match) return null;
      return streamObj(match[1], typeFromExt(match[1]), serverName, url);

    } else if (url.includes("mp4upload")) {
      const match = html.match(/player.src\(["']([^"']+)["']\)/);
      if (!match) return null;
      return streamObj(match[1], 'mp4', serverName, url);
    }

  } catch (err) {
    console.error(`[${serverName}] Extract error:`, err);
  }

  return null;
}

function streamObj(url, type, server, original) {
  return {
    streamUrl: url,
    type,
    quality: 'auto',
    original,
    server
  };
}

function typeFromExt(url) {
  return url.endsWith(".m3u8") ? "hls" : "mp4";
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
