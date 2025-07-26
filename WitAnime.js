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
  const multiStreams = { streams: [], subtitles: null };

  try {
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': url
      }
    });
    const html = await res.text();

    // استخراج كل السيرفرات
    const serverRegex = /<a[^>]+class="server-link"[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*<\/a>/gi;
    const serverNames = [];
    let match;

    while ((match = serverRegex.exec(html)) !== null) {
      const name = match[1].trim().toLowerCase();
      serverNames.push(name);
    }

    // تحليل السيرفرات المعروفة وتهيئة الرابط المحتمل
    for (const name of serverNames) {
      let streamUrl = null;
      let format = null;

      if (name.includes("ok.ru")) {
        streamUrl = "https://ok.ru"; format = "MP4";
      } else if (name.includes("dailymotion")) {
        streamUrl = "https://www.dailymotion.com"; format = "HLS";
      } else if (name.includes("videa")) {
        streamUrl = "https://videa.hu"; format = "MP4";
      } else if (name.includes("streamwish")) {
        streamUrl = "https://streamwish.to"; format = "HLS";
      } else if (name.includes("yonaplay")) {
        streamUrl = "https://yonaplay.com"; format = "MP4";
      }

      if (streamUrl) {
        multiStreams.streams.push({
          title: name,
          streamUrl,
          type: format,
          headers: { Referer: url }
        });
      }
    }

    // fallback في حالة عدم وجود أي سيرفرات صالحة
    if (multiStreams.streams.length === 0) {
      multiStreams.streams.push({
        title: "Default Fallback",
        streamUrl: "https://files.catbox.moe/avolvc.mp4",
        type: "MP4",
        headers: {}
      });
    }

    return multiStreams;
  } catch (err) {
    return {
      streams: [{
        title: "Error",
        streamUrl: "https://files.catbox.moe/avolvc.mp4",
        type: "MP4",
        headers: {}
      }],
      subtitles: null
    };
  }
}

function extractVideoSources(html) {
  const mp4 = [];
  const hls = [];

  const hlsRegex = /['"]?(https?:\/\/[^'"]+\.m3u8[^'"]*)['"]?/gi;
  const mp4Regex = /['"]?(https?:\/\/[^'"]+\.mp4[^'"]*)['"]?/gi;

  let match;

  while ((match = hlsRegex.exec(html)) !== null) {
    hls.push(match[1]);
  }

  while ((match = mp4Regex.exec(html)) !== null) {
    mp4.push(match[1]);
  }

  return { hls, mp4 };
}

async function extractSelectedStream(serverName, link) {
  const lower = serverName.toLowerCase();

  if (lower.includes('ok')) {
    return await (async function extractOkru(url) {
      const res = await soraFetch(url, { headers: { Referer: url } });
      const html = await res.text();
      const m3u8 = html.match(/"(https:\/\/[^"]+\.m3u8[^"]*)"/)?.[1];
      if (!m3u8) return [];
      return [{
        title: 'OK.ru (HLS)',
        streamUrl: m3u8,
        headers: { Referer: url }
      }];
    })(link);
  }

  if (lower.includes('dailymotion')) {
    return await (async function extractDailymotion(url) {
      const id = url.match(/video\/([^_]+)/)?.[1];
      if (!id) return [];

      const res = await soraFetch(`https://www.dailymotion.com/player/metadata/video/${id}`);
      const json = await res.json();

      const streams = [];
      for (const quality in json.qualities) {
        const sources = json.qualities[quality];
        for (const source of sources) {
          if (source.type === 'application/x-mpegURL' || source.type === 'video/mp4') {
            streams.push({
              title: `Dailymotion - ${quality}`,
              streamUrl: source.url,
              headers: { Referer: url }
            });
          }
        }
      }
      return streams;
    })(link);
  }

  if (lower.includes('streamwish')) {
    return await (async function extractStreamwish(url) {
      const res = await soraFetch(url, { headers: { Referer: url } });
      const html = await res.text();
      const sources = [...html.matchAll(/file\s*:\s*["']([^"']+)["']\s*,\s*label\s*:\s*["']([^"']+)["']/g)];
      if (!sources.length) return [];
      return sources.map(src => ({
        title: `Streamwish - ${src[2]}`,
        streamUrl: src[1],
        headers: { Referer: url }
      }));
    })(link);
  }

  if (lower.includes('videa')) {
    return await (async function extractVidea(url) {
      const res = await soraFetch(url, { headers: { Referer: url } });
      const html = await res.text();
      const file = html.match(/sources:\s*\[\s*{file:\s*"([^"]+\.mp4)"/)?.[1];
      if (!file) return [];
      return [{
        title: 'Videa (MP4)',
        streamUrl: file,
        headers: { Referer: url }
      }];
    })(link);
  }

  if (lower.includes('yonaplay')) {
    return await (async function extractYonaPlay(url) {
      const res = await soraFetch(url, { headers: { Referer: url } });
      const html = await res.text();
      const m3u8 = html.match(/file\s*:\s*['"](https:\/\/[^'"]+\.m3u8[^'"]*)['"]/i)?.[1];
      if (!m3u8) return [];
      return [{
        title: 'YonaPlay (HLS)',
        streamUrl: m3u8,
        headers: { Referer: url }
      }];
    })(link);
  }

  return [];
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET');
  } catch (err) {
    return { text: async () => '', json: async () => ({}) };
  }
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
