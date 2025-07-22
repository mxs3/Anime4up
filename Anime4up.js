async function searchResults(keyword) {
  try {
    const url = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://4s.qerxam.shop/'
      }
    });
    const html = await res.text();

    const results = [];
    const blocks = html.split('anime-card-container');
    for (const block of blocks) {
      const hrefMatch = block.match(/<a href="([^"]+\/anime\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
      const titleMatch = block.match(/anime-card-title[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/);

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

    const descMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/i);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

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
  } catch {
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
    const getPage = async (pageUrl) => {
      const res = await fetchv2(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": url
        }
      });
      return await res.text();
    };

    const firstHtml = await getPage(url);
    const typeMatch = firstHtml.match(/<div class="anime-info"><span>النوع:<\/span>\s*([^<]+)<\/div>/i);
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : "";

    if (type.includes("movie") || type.includes("فيلم")) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    const paginationRegex = /<a[^>]+href="([^"]+\/page\/\d+\/?)"[^>]*class="page-numbers"/gi;
    const pagesSet = new Set();
    let match;
    while ((match = paginationRegex.exec(firstHtml)) !== null) {
      pagesSet.add(match[1]);
    }

    const pages = Array.from(pagesSet);
    pages.push(url);

    const htmlPages = await Promise.all(pages.map(page => getPage(page)));

    for (const html of htmlPages) {
      const episodeRegex = /<div class="episodes-card-title">\s*<h3>\s*<a\s+href="([^"]+)">[^<]*الحلقة\s*(\d+)[^<]*<\/a>/gi;
      let epMatch;
      while ((epMatch = episodeRegex.exec(html)) !== null) {
        const episodeUrl = epMatch[1].trim();
        const episodeNumber = parseInt(epMatch[2].trim(), 10);
        if (!isNaN(episodeNumber)) {
          results.push({
            href: episodeUrl,
            number: episodeNumber
          });
        }
      }
    }

    results.sort((a, b) => a.number - b.number);

    if (results.length === 0) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    return JSON.stringify(results);
  } catch {
    return JSON.stringify([{ href: url, number: 1 }]);
  }
}

async function extractStreamUrl(url) {
  if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

  const res = await soraFetch(url);
  if (!res) return [];

  const html = await res.text();
  if (!html) return [];

  const serverList = [...html.matchAll(/<a[^>]+data-ep-url=["']([^"']+)["'][^>]*>(.*?)<\/a>/g)];
  const results = [];

  for (const [, serverUrlRaw, serverName] of serverList) {
    const serverUrl = serverUrlRaw.startsWith('http') ? serverUrlRaw : _0x7E9A(serverUrlRaw, url);
    const lower = serverUrl.toLowerCase();

    if (lower.includes('uqload')) {
      const streams = await extractUqload(serverUrl);
      for (const s of streams) {
        results.push({
          title: `[Uqload] ${s.quality}`,
          streamUrl: s.url,
          headers: s.headers
        });
      }
    }

    if (lower.includes('vidmoly')) {
      const streams = await extractVidmoly(serverUrl);
      for (const s of streams) {
        results.push({
          title: `[Vidmoly] ${s.quality}`,
          streamUrl: s.url,
          headers: s.headers
        });
      }
    }

    if (lower.includes('mp4upload')) {
      const streams = await extractMp4upload(serverUrl);
      for (const s of streams) {
        results.push({
          title: `[Mp4upload] ${s.quality}`,
          streamUrl: s.url,
          headers: s.headers
        });
      }
    }
  }

  return results;
}

function _0xCheck() {
  return typeof soraFetch !== 'undefined' && typeof fetchV2 !== 'undefined';
}

function _0x7E9A(encodedUrl, referer) {
  try {
    const a = new URL(referer);
    const b = a.origin;
    return b + encodedUrl;
  } catch {
    return encodedUrl;
  }
}

async function soraFetch(url, options = {}) {
  return await fetchV2(url, {
    ...options,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      ...(options.headers || {})
    }
  });
}

async function extractVidmoly(url) {
  const res = await soraFetch(url, {
    headers: { Referer: url }
  });
  if (!res) return [];

  const html = await res.text();
  if (!html) return [];

  const matches = [...html.matchAll(/file:\s*['"]([^'"]+)['"].*?label:\s*['"]([^'"]+)['"]/g)];
  if (!matches.length) return [];

  return matches.map(m => ({
    url: m[1],
    quality: m[2],
    headers: {
      Referer: url,
      'User-Agent': 'Mozilla/5.0'
    }
  }));
}

async function extractMp4upload(url) {
  const res = await soraFetch(url, {
    headers: { Referer: url }
  });
  if (!res) return [];

  const html = await res.text();
  if (!html) return [];

  const match = html.match(/player\.src\(\{\s*type:\s*['"]video\/mp4['"],\s*src:\s*['"]([^'"]+)['"]\s*\}\)/);
  if (!match) return [];

  return [{
    url: match[1],
    quality: '480p',
    headers: {
      Referer: url,
      'User-Agent': 'Mozilla/5.0'
    }
  }];
}

async function extractUqload(url) {
  const res = await soraFetch(url, {
    headers: { Referer: url }
  });
  if (!res) return [];

  const html = await res.text();
  if (!html) return [];

  const match = html.match(/"file"\s*:\s*"([^"]+)"/);
  if (!match) return [];

  return [{
    url: match[1],
    quality: '480p',
    headers: {
      Referer: url,
      'User-Agent': 'Mozilla/5.0'
    }
  }];
}

function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#39;': "'"
  };
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}
