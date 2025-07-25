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

  const multiStreams = { streams: [], subtitles: null };

  const res = await soraFetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const html = await res.text();
  const servers = [...html.matchAll(/<a[^>]+class="server-link"[^>]*onclick="openServer\('([^']+)'\)"[^>]*>[\s\S]*?<span[^>]*class="ser"[^>]*>([^<]+)<\/span>/g)];

  for (const match of servers) {
    const encodedUrl = match[1];
    const serverName = match[2]?.trim()?.toLowerCase();
    const decodedUrl = atob(encodedUrl);

    if (serverName.includes("streamwish")) {
      const links = await extractStreamwish(decodedUrl);
      for (const l of links) {
        multiStreams.streams.push({
          title: `Streamwish - ${l.quality}`,
          streamUrl: l.url,
          headers: l.headers
        });
      }
    }

    if (serverName.includes("ok.ru")) {
      const links = await extractOkru(decodedUrl);
      for (const l of links) {
        multiStreams.streams.push({
          title: `OK.ru - ${l.quality}`,
          streamUrl: l.url,
          headers: l.headers
        });
      }
    }

    if (serverName.includes("videa")) {
      const links = await extractVidea(decodedUrl);
      for (const l of links) {
        multiStreams.streams.push({
          title: `Videa - ${l.quality}`,
          streamUrl: l.url,
          headers: l.headers
        });
      }
    }

    if (serverName.includes("mp4upload")) {
      const links = await extractMp4upload(decodedUrl);
      for (const l of links) {
        multiStreams.streams.push({
          title: `Mp4upload - ${l.quality}`,
          streamUrl: l.url,
          headers: l.headers
        });
      }
    }

    if (serverName.includes("yonaplay")) {
      multiStreams.streams.push({
        title: `Yonaplay`,
        streamUrl: decodedUrl,
        headers: { Referer: url }
      });
    }
  }

  if (!multiStreams.streams.length) {
    multiStreams.streams.push({
      title: 'Fallback',
      streamUrl: 'https://files.catbox.moe/avolvc.mp4',
      headers: {}
    });
  }

  return multiStreams;
}

// ========== Extractors ==========

async function extractStreamwish(embedUrl) {
  try {
    const res = await soraFetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    const m3u8 = html.match(/file\s*:\s*["'](https:\/\/[^"']+\.m3u8)["']/)?.[1];
    if (!m3u8) return [];
    return [{
      url: m3u8,
      quality: 'Auto',
      headers: { Referer: embedUrl }
    }];
  } catch { return []; }
}

async function extractOkru(embedUrl) {
  try {
    const res = await soraFetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = new TextDecoder('windows-1251').decode(await res.arrayBuffer());
    const sources = [...html.matchAll(/"url":"(https:[^"]+mp4)","name":"([^"]+)"/g)];
    return sources.map(s => ({
      url: s[1].replace(/\\\//g, '/'),
      quality: s[2],
      headers: { Referer: embedUrl }
    }));
  } catch { return []; }
}

async function extractVidea(embedUrl) {
  try {
    const res = await soraFetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    const file = html.match(/sources:\s*\[\s*{file:"([^"]+\.mp4)"/)?.[1];
    if (!file) return [];
    return [{
      url: file,
      quality: 'SD',
      headers: { Referer: embedUrl }
    }];
  } catch { return []; }
}

async function extractMp4upload(embedUrl) {
  try {
    const page = await soraFetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await page.text();

    const id = html.match(/embed-(\w+)\.html/)?.[1];
    if (!id) return [];

    const direct = `https://www.mp4upload.com:282/d/${id}/video.mp4`;
    return [{
      url: direct,
      quality: 'HD',
      headers: { Referer: embedUrl }
    }];
  } catch { return []; }
}

function _0xCheck() {
  return true;
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
