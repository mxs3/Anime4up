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
  const $ = _0x7E9A(html);
  const servers = [];
  $('#episode-servers a.server-link').each((_, el) => {
    const serverName = $(el).find('.ser').text().trim().toLowerCase();
    const link = $(el).attr('data-ep-url') || $(el).attr('data-url') || '';
    if (link.includes('ok.ru')) servers.push({ server: 'okru', url: link });
    else if (link.includes('videa')) servers.push({ server: 'videa', url: link });
    else if (link.includes('streamwish')) servers.push({ server: 'streamwish', url: link });
    else if (link.includes('dailymotion')) servers.push({ server: 'dailymotion', url: link });
    else if (link.includes('yonaplay') || link.includes('.m3u8')) servers.push({ server: 'hls', url: link });
  });

  const multiStreams = { streams: [], subtitles: null };
  for (const s of servers) {
    let result = [];
    if (s.server === 'streamwish') result = await extractStreamwish(s.url);
    else if (s.server === 'okru') result = await extractOkru(s.url);
    else if (s.server === 'videa') result = await extractVidea(s.url);
    else if (s.server === 'dailymotion') result = await extractDailymotion(s.url);
    else if (s.server === 'hls') result = [{ url: s.url, quality: 'auto', headers: {} }];
    for (const r of result) {
      multiStreams.streams.push({
        title: `${s.server.toUpperCase()} | ${r.quality}`,
        streamUrl: r.url,
        headers: r.headers || {},
      });
    }
  }

  return multiStreams;
}

function _0xCheck() {
  try {
    const test = atob('Y2F0Ym94Lm1wNA==');
    return test === 'catbox.mp4';
  } catch {
    return false;
  }
}

function _0x7E9A(html) {
  const cheerio = require('cheerio');
  return cheerio.load(html);
}

async function soraFetch(url, options = {}) {
  return await fetch(url, {
    headers: { 'User-Agent': 'Sora', ...(options.headers || {}) },
    ...options,
  });
}

async function extractStreamwish(url) {
  const res = await soraFetch(url);
  const html = await res.text();
  const file = html.match(/sources:\s*\[\s*\{file:\s*["']([^"']+)["']/)?.[1];
  if (!file) return [];
  return [{ url: file, quality: 'auto', headers: {} }];
}

async function extractOkru(url) {
  const res = await soraFetch(url);
  const html = await res.text();
  const sources = [...html.matchAll(/"url720":"(.*?)"/g)].map((x) => x[1].replace(/\\/g, ''));
  if (!sources.length) return [];
  return sources.map((url) => ({ url, quality: '720p', headers: {} }));
}

async function extractVidea(url) {
  const res = await soraFetch(url);
  const html = await res.text();
  const match = html.match(/sources:\s*\[\s*\{file:\s*["']([^"']+)["']/);
  if (!match) return [];
  return [{ url: match[1], quality: 'auto', headers: {} }];
}

async function extractDailymotion(url) {
  const res = await soraFetch(url);
  const html = await res.text();
  const match = html.match(/"type":"application\/x-mpegURL","url":"([^"]+)"/);
  if (!match) return [];
  return [{ url: match[1].replace(/\\/g, ''), quality: 'auto', headers: {} }];
}
