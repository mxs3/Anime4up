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

  const res = await soraFetch(url);
  const html = await res.text();

  const streams = [];
  const serverBlocks = html.split('<a href="javascript:void(0);" class="server-link"');

  for (let i = 1; i < serverBlocks.length; i++) {
    const block = serverBlocks[i];
    const name = (block.match(/<span class="ser">([^<]+)<\/span>/) || [])[1];
    if (!name) continue;

    streams.push({
      title: name.trim(),
      streamUrl: null,
      headers: defaultHeaders()
    });
  }

  const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"[^>]*><\/iframe>/);
  if (iframeMatch) {
    const iframeUrl = iframeMatch[1].startsWith('http') ? iframeMatch[1] : 'https:' + iframeMatch[1];

    if (iframeUrl.includes('videa.hu')) {
      const videa = await extractVidea(iframeUrl);
      for (const s of videa) {
        streams.unshift({
          title: 'Videa - ' + s.quality,
          streamUrl: s.url,
          headers: s.headers
        });
      }
    } else if (iframeUrl.includes('ok.ru')) {
      const okru = await extractOkru(iframeUrl);
      for (const s of okru) {
        streams.unshift({
          title: 'OK.ru - ' + s.quality,
          streamUrl: s.url,
          headers: s.headers
        });
      }
    } else if (iframeUrl.includes('yonaplay')) {
      streams.unshift({
        title: 'Yonaplay',
        streamUrl: iframeUrl,
        headers: defaultHeaders()
      });
    } else {
      if (streams.length > 0) streams[0].streamUrl = iframeUrl;
    }
  }

  for (let i = 0; i < streams.length; i++) {
    if (!streams[i].streamUrl) {
      streams[i].streamUrl = 'https://files.catbox.moe/avolvc.mp4';
    }
  }

  return {
    streams,
    subtitles: null
  };
}

async function extractVidea(url) {
  const res = await soraFetch(url);
  const html = await res.text();

  const out = [];
  const match = html.match(/sources:\s*\[([^\]]+)\]/);
  if (match) {
    const items = match[1].split('},');
    for (let item of items) {
      const file = (item.match(/file\s*:\s*["']([^"']+)["']/) || [])[1];
      const label = (item.match(/label\s*:\s*["']([^"']+)["']/) || [])[1];
      if (file) {
        out.push({
          url: file,
          quality: label || 'SD',
          headers: defaultHeaders()
        });
      }
    }
  }

  return out;
}

async function extractOkru(url) {
  const res = await soraFetch(url, { headers: defaultHeaders() });
  const html = await res.text();

  const out = [];
  const json = html.match(/data-options="([^"]+)"/);
  if (json) {
    const decoded = decodeURIComponent(json[1]);
    const fileMatch = decoded.match(/"videos":(\[.*?\])/);
    if (fileMatch) {
      try {
        const videos = JSON.parse(fileMatch[1]);
        for (const v of videos) {
          out.push({
            url: v.url,
            quality: v.name,
            headers: defaultHeaders()
          });
        }
      } catch (_) {}
    }
  }

  return out;
}

function defaultHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': '*/*',
    'Referer': 'https://witanime.world/'
  };
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
  } catch (e) {
    return { text: async () => '' };
  }
}

function _0xCheck() {
  return typeof fetchv2 !== 'undefined';
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
