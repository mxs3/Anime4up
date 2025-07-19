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
  const multiStreams = { streams: [], subtitles: null };
  try {
    const html = await fetchv2(url);
    const servers = [];
    const serverRegex = /<a[^>]+id="([^"]+)"[^>]+data-ep-url="([^"]+)"/gi;
    let match;
    while ((match = serverRegex.exec(html)) !== null) {
      const id = match[1]?.toLowerCase().trim();
      const rawUrl = match[2]?.trim();
      const name = match[0]?.toLowerCase();
      let normalized = '';
      if (id.includes('vidmoly') || name.includes('vidmoly')) normalized = 'vidmoly';
      else if (id.includes('uqload') || name.includes('uqload')) normalized = 'uqload';
      else if (id.includes('mp4upload') || name.includes('mp4upload')) normalized = 'mp4upload';
      else if (id.includes('voe') || name.includes('voe')) normalized = 'voe';
      else if (id.includes('vk') || name.includes('vk')) normalized = 'vk';
      else if (id.includes('videa') || name.includes('videa')) normalized = 'videa';
      else if (id.includes('mega') || name.includes('mega')) normalized = 'mega';
      if (normalized && rawUrl) {
        const finalUrl = rawUrl.startsWith('http') ? rawUrl : `https:${rawUrl}`;
        servers.push({ server: normalized, url: finalUrl });
      }
    }

    for (const srv of servers) {
      let result = [];
      if (srv.server === 'uqload') result = await extractUqload(srv.url);
      if (srv.server === 'vidmoly') result = await extractVidmoly(srv.url);
      if (srv.server === 'mp4upload') result = await extractMp4upload(srv.url);
      if (srv.server === 'voe') result = await extractVoe(srv.url);
      if (srv.server === 'vk') result = await extractVk(srv.url);
      if (srv.server === 'videa') result = await extractVidea(srv.url);
      if (srv.server === 'mega') result = await extractMega(srv.url);
      if (result.length) multiStreams.streams.push(...result);
    }

    if (!multiStreams.streams.length) {
      multiStreams.streams.push({
        title: 'Fallback 480p',
        streamUrl: 'https://files.catbox.moe/avolvc.mp4',
        headers: {}
      });
    }
  } catch {
    multiStreams.streams.push({
      title: 'Fallback 480p',
      streamUrl: 'https://files.catbox.moe/avolvc.mp4',
      headers: {}
    });
  }

  return multiStreams;

  async function fetchv2(u, referer = url) {
    return await (await fetch(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': referer
      }
    })).text();
  }

  async function extractUqload(embedUrl) {
    try {
      const res = await fetchv2(embedUrl);
      const fileMatch = res.match(/file:\s*["']([^"']+\.mp4)["']/);
      if (!fileMatch) return [];
      return [{
        title: '480p',
        streamUrl: fileMatch[1],
        headers: { Referer: embedUrl }
      }];
    } catch {
      return [];
    }
  }

  async function extractVidmoly(embedUrl) {
    try {
      const res = await fetchv2(embedUrl);
      const matches = [...res.matchAll(/label:\s*"([^"]+)",\s*file:\s*"([^"]+)"/g)];
      if (!matches.length) return [];
      return matches.map(m => ({
        title: m[1],
        streamUrl: m[2],
        headers: { Referer: embedUrl }
      }));
    } catch {
      return [];
    }
  }

  async function extractMp4upload(embedUrl) {
    try {
      const res = await fetchv2(embedUrl);
      const match = res.match(/player\.src\(["']([^"']+\.mp4)["']\)/);
      if (!match) return [];
      return [{
        title: '480p',
        streamUrl: match[1],
        headers: { Referer: embedUrl }
      }];
    } catch {
      return [];
    }
  }

  async function extractVoe(embedUrl) {
    try {
      const res = await fetchv2(embedUrl);
      const match = res.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+\.mp4)["']/);
      if (!match) return [];
      return [{
        title: 'Auto',
        streamUrl: match[1],
        headers: { Referer: embedUrl }
      }];
    } catch {
      return [];
    }
  }

  async function extractVk(embedUrl) {
    try {
      return [{
        title: 'Auto',
        streamUrl: embedUrl,
        headers: { Referer: embedUrl }
      }];
    } catch {
      return [];
    }
  }

  async function extractVidea(embedUrl) {
    try {
      return [{
        title: 'Auto',
        streamUrl: embedUrl,
        headers: { Referer: embedUrl }
      }];
    } catch {
      return [];
    }
  }

  async function extractMega(embedUrl) {
    try {
      return [{
        title: 'فتح عبر Mega',
        streamUrl: embedUrl,
        headers: { Referer: embedUrl }
      }];
    } catch {
      return [];
    }
  }
}
