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
  if (!_0xCheck()) {
    return fallbackStream();
  }

  const html = await (await soraFetch(url)).text();
  const multiStreams = { streams: [], subtitles: null };

  // ريجيكس قوي لسحب كل السيرفرات من صفحة الحلقة
  const serverRegex = /<li[^>]+data-id=["']?(\d+)["']?[^>]*data-server=["']?([^"'>\s]+)["']?[^>]*>/gi;
  const servers = [];
  let match;

  while ((match = serverRegex.exec(html)) !== null) {
    const id = match[1];
    const server = match[2].toLowerCase();
    if (!['videa', 'yonaplay'].includes(server)) {
      servers.push({ id, server });
    }
  }

  for (const { id, server } of servers) {
    try {
      const embedUrl = `https://witanime.world/ajax/embed.php?id=${id}`;
      const res = await soraFetch(embedUrl, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      const json = await res.json();
      const iframeSrc = json?.src;
      if (!iframeSrc) continue;

      const extracted = await extractFromEmbed(iframeSrc, server);
      if (extracted) multiStreams.streams.push(extracted);
    } catch (err) {
      console.error(`[${server}] Error extracting embed:`, err);
    }
  }

  if (!multiStreams.streams.length) {
    multiStreams.streams.push(fallbackStream().streams[0]);
  }

  return multiStreams;
}

function fallbackStream() {
  return {
    streams: [{
      streamUrl: 'https://files.catbox.moe/avolvc.mp4',
      type: 'mp4',
      quality: 'fallback',
      original: 'fallback',
      server: 'fallback'
    }],
    subtitles: null
  };
}

async function extractFromEmbed(iframeUrl, server) {
  try {
    if (iframeUrl.includes('dailymotion.com')) return await extractDailymotion(iframeUrl);
    if (iframeUrl.includes('ok.ru')) return await extractOkru(iframeUrl);
    if (iframeUrl.includes('streamwish')) return await extractStreamWish(iframeUrl);
    if (iframeUrl.includes('mp4upload.com')) return await extractMp4upload(iframeUrl);
    if (iframeUrl.includes('upstream.to')) return await extractUpstream(iframeUrl);
    if (iframeUrl.includes('fembed') || iframeUrl.includes('vcdn')) return await extractFembed(iframeUrl);
    if (iframeUrl.includes('filemoon')) return await extractFilemoon(iframeUrl);
    if (iframeUrl.includes('streamtape')) return await extractStreamtape(iframeUrl);

    return {
      streamUrl: iframeUrl,
      type: "external",
      quality: "unknown",
      original: iframeUrl,
      server: server || "unknown"
    };
  } catch (err) {
    console.error(`[${server}] extractFromEmbed failed:`, err);
    return null;
  }
}

// --- دوال الاستخراج لكل سيرفر مدعوم ---

async function extractDailymotion(url) {
  try {
    const videoID = url.match(/video\/([a-zA-Z0-9]+)/)?.[1];
    if (!videoID) return null;

    const apiUrl = `https://www.dailymotion.com/player/metadata/video/${videoID}`;
    const res = await soraFetch(apiUrl);
    const data = await res.json();

    const hlsUrl = data?.qualities?.auto?.[0]?.url;
    if (!hlsUrl) return null;

    return {
      streamUrl: hlsUrl,
      type: "hls",
      quality: "auto",
      original: url,
      server: "dailymotion"
    };
  } catch (err) {
    console.error("Dailymotion extract error:", err);
    return null;
  }
}

async function extractOkru(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const jsonMatch = html.match(/data-options="([^"]+)"/);
    if (!jsonMatch) return null;

    const decoded = decodeURIComponent(jsonMatch[1]);
    const json = JSON.parse(decoded);
    const metadata = json.flashvars?.metadata;
    const streamMeta = JSON.parse(metadata);

    const hls = streamMeta.hls?.url || streamMeta.hls4?.url;
    if (!hls) return null;

    return {
      streamUrl: hls,
      type: "hls",
      quality: "auto",
      original: url,
      server: "okru"
    };
  } catch (err) {
    console.error("Okru extract error:", err);
    return null;
  }
}

async function extractStreamWish(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const match = html.match(/sources:\s*\[\s*{\s*file:\s*["'](.*?)["']/);
    if (!match) return null;

    const file = match[1];
    return {
      streamUrl: file,
      type: file.endsWith('.m3u8') ? 'hls' : 'mp4',
      quality: "auto",
      original: url,
      server: "streamwish"
    };
  } catch (err) {
    console.error("StreamWish extract error:", err);
    return null;
  }
}

async function extractMp4upload(url) {
  try {
    const id = url.match(/\/embed-([a-zA-Z0-9]+)\.html/)?.[1];
    if (!id) return null;

    const res = await soraFetch(`https://www.mp4upload.com/embed-${id}.html`);
    const html = await res.text();

    const match = html.match(/player\.src\(["']([^"']+)["']\)/);
    if (!match) return null;

    return {
      streamUrl: match[1],
      type: "mp4",
      quality: "auto",
      original: url,
      server: "mp4upload"
    };
  } catch (err) {
    console.error("Mp4upload extract error:", err);
    return null;
  }
}

async function extractUpstream(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const match = html.match(/sources:\s*\[\s*{file:\s*["']([^"']+)["']/);
    if (!match) return null;

    const file = match[1];
    return {
      streamUrl: file,
      type: file.endsWith('.m3u8') ? 'hls' : 'mp4',
      quality: "auto",
      original: url,
      server: "upstream"
    };
  } catch (err) {
    console.error("Upstream extract error:", err);
    return null;
  }
}

async function extractFembed(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const match = html.match(/sources\s*:\s*(\[[^\]]+\])/);
    if (!match) return null;

    const sources = JSON.parse(match[1]);
    const file = sources.find(src => src.file?.includes('m3u8') || src.file?.includes('.mp4'));
    if (!file) return null;

    return {
      streamUrl: file.file,
      type: file.file.endsWith('.m3u8') ? 'hls' : 'mp4',
      quality: "auto",
      original: url,
      server: "fembed"
    };
  } catch (err) {
    console.error("Fembed extract error:", err);
    return null;
  }
}

async function extractFilemoon(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const match = html.match(/file:\s*["']([^"']+)["']/);
    if (!match) return null;

    const file = match[1];
    return {
      streamUrl: file,
      type: file.endsWith('.m3u8') ? 'hls' : 'mp4',
      quality: "auto",
      original: url,
      server: "filemoon"
    };
  } catch (err) {
    console.error("Filemoon extract error:", err);
    return null;
  }
}

async function extractStreamtape(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const match = html.match(/'robotlink'\s*,\s*'([^']+)'/);
    if (!match) return null;

    return {
      streamUrl: `https:${match[1]}`,
      type: "mp4",
      quality: "auto",
      original: url,
      server: "streamtape"
    };
  } catch (err) {
    console.error("Streamtape extract error:", err);
    return null;
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
