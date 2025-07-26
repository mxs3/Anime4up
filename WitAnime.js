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
  if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

  const html = await (await soraFetch(url)).text();
  const multiStreams = { streams: [], subtitles: null };

  // استخراج روابط iframe للسيرفرات
  const iframeRegex = /<li[^>]*data-id=["']([^"']+)["'][^>]*data-server=["'][^"']*["'][^>]*>/g;
  const serverList = [];
  let match;

  while ((match = iframeRegex.exec(html)) !== null) {
    serverList.push(match[1]);
  }

  if (!serverList.length) return multiStreams;

  // محاولة استخراج كل السيرفرات
  for (const iframeId of serverList) {
    try {
      const embedUrl = `https://witanime.world/ajax/embed.php?id=${iframeId}`;
      const res = await soraFetch(embedUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const json = await res.json();
      const iframeSrc = json?.src;

      if (!iframeSrc) continue;

      const extracted = await extractFromEmbed(iframeSrc);
      if (extracted) multiStreams.streams.push(extracted);
    } catch (err) {
      console.error('Error loading server:', err);
    }
  }

  return multiStreams;
}

async function extractFromEmbed(iframeUrl) {
  if (iframeUrl.includes('dailymotion.com')) {
    return await extractDailymotion(iframeUrl);
  } else if (iframeUrl.includes('ok.ru')) {
    return await extractOkru(iframeUrl);
  } else if (iframeUrl.includes('streamwish')) {
    return await extractStreamWish(iframeUrl);
  } else if (iframeUrl.includes('mp4upload.com')) {
    return await extractMp4upload(iframeUrl);
  } else if (iframeUrl.includes('upstream.to')) {
    return await extractUpstream(iframeUrl);
  }

  return null;
}

// دالة استخراج Dailymotion
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

// دالة استخراج ok.ru
async function extractOkru(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const jsonMatch = html.match(/data-options="([^"]+)"/);
    if (!jsonMatch) return null;

    const decoded = decodeURIComponent(jsonMatch[1]);
    const json = JSON.parse(decoded);
    const hls = json.flashvars?.metadata;
    const streamMeta = JSON.parse(hls);

    const qualities = streamMeta.hls?.url || streamMeta.hls4?.url;
    if (!qualities) return null;

    return {
      streamUrl: qualities,
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

// دالة استخراج streamwish
async function extractStreamWish(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const sourceMatch = html.match(/sources:\s*\[\s*{\s*file:\s*["'](.*?)["']/);

    if (!sourceMatch) return null;
    const streamUrl = sourceMatch[1];

    return {
      streamUrl,
      type: streamUrl.endsWith('.m3u8') ? 'hls' : 'mp4',
      quality: "auto",
      original: url,
      server: "streamwish"
    };
  } catch (err) {
    console.error("StreamWish extract error:", err);
    return null;
  }
}

// دالة استخراج mp4upload
async function extractMp4upload(url) {
  try {
    const id = url.match(/\/embed-([a-zA-Z0-9]+)\.html/)?.[1];
    if (!id) return null;

    const apiUrl = `https://www.mp4upload.com/embed-${id}.html`;
    const res = await soraFetch(apiUrl);
    const html = await res.text();

    const fileMatch = html.match(/player.src\(["'](.*?)["']\)/);
    if (!fileMatch) return null;

    return {
      streamUrl: fileMatch[1],
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

// دالة استخراج upstream
async function extractUpstream(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();
    const fileMatch = html.match(/sources:\s*\[\s*{file:\s*["']([^"']+)["']/);

    if (!fileMatch) return null;
    const streamUrl = fileMatch[1];

    return {
      streamUrl,
      type: streamUrl.endsWith('.m3u8') ? 'hls' : 'mp4',
      quality: "auto",
      original: url,
      server: "upstream"
    };
  } catch (err) {
    console.error("Upstream extract error:", err);
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
