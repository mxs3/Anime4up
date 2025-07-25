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
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    }
  });

  const html = await res.text();
  const serverList = [...html.matchAll(/<a[^>]+class="server-link"[^>]+>([\s\S]*?)<\/a>/g)];

  for (const server of serverList) {
    const serverName = server[1]?.match(/<span[^>]*class="ser"[^>]*>([^<]+)<\/span>/)?.[1]?.trim()?.toLowerCase();
    const link = server[0]?.match(/openServer\(['"]([^'"]+)['"]\)/)?.[1];
    if (!serverName || !link) continue;

    const decodedLink = atob(link);

    if (serverName.includes('dailymotion')) {
      const streams = await extractDailymotionStreams(decodedLink);
      multiStreams.streams.push(...streams.map(s => ({
        title: `Dailymotion - ${s.quality}`,
        streamUrl: s.url,
        headers: { Referer: decodedLink }
      })));
    }
    // تقدر تضيف باقي السيرفرات هنا بنفس الطريقة
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

async function extractDailymotionStreams(url) {
  try {
    const videoId = url.match(/dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/)?.[1];
    if (!videoId) return [];

    const res = await soraFetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: url
      }
    });

    const data = await res.json();
    const streams = [];

    const order = ['1080', '720', '480', '380', '240', '144'];
    for (const q of order) {
      if (data.qualities[q]) {
        for (const stream of data.qualities[q]) {
          if (stream?.url) {
            streams.push({
              quality: `${q}p`,
              url: stream.url
            });
            break;
          }
        }
      }
    }

    return streams;
  } catch (e) {
    return [];
  }
}

function _0xCheck() {
  // check logic
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
