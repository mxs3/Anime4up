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

  const multiStreams = {
    streams: [],
    subtitles: null
  };

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Referer': url,
  };

  try {
    const res = await fetchv2(url, headers);
    const html = await res.text();

    // ✅ Dailymotion
    const dailymotionMatch = html.match(/<iframe[^>]+src=["'](https:\/\/www\.dailymotion\.com\/embed\/video\/[^"']+)["']/i);
    if (dailymotionMatch) {
      multiStreams.streams.push({
        title: "Dailymotion",
        streamUrl: dailymotionMatch[1],
        headers,
        subtitles: null
      });
    }

    // ✅ hglink.to أو haxloppd.com → streamwish
    const altDomainsMatch = html.match(/<iframe[^>]+src=["'](https:\/\/(?:hglink\.to|haxloppd\.com)\/e\/[^"']+)["']/i);
    if (altDomainsMatch) {
      const realEmbed = await extractStreamwishFromProxy(altDomainsMatch[1], headers);
      if (realEmbed) {
        multiStreams.streams.push({
          title: "Streamwish Proxy",
          streamUrl: realEmbed,
          headers,
          subtitles: null
        });
      }
    }

    // ✅ streamwish مباشرة
    const streamwishMatch = html.match(/<iframe[^>]+src=["'](https:\/\/streamwish\.[^"']+)["']/i);
    if (streamwishMatch) {
      const direct = await extractStreamwishDirect(streamwishMatch[1], headers);
      if (direct) {
        multiStreams.streams.push({
          title: "Streamwish",
          streamUrl: direct,
          headers,
          subtitles: null
        });
      }
    }

    if (multiStreams.streams.length === 0) {
      console.warn("❌ No supported streams found.");
      return JSON.stringify({ streams: [], subtitles: null });
    }

    return JSON.stringify(multiStreams);

  } catch (err) {
    console.error("❌ Error in extractStreamUrl:", err);
    return JSON.stringify({ streams: [], subtitles: null });
  }

  // ✅ استخراج من hglink / haxloppd
  async function extractStreamwishFromProxy(proxyUrl, headers) {
    try {
      const res = await fetchv2(proxyUrl, headers);
      const html = await res.text();
      const streamwishEmbed = html.match(/<iframe[^>]+src=["'](https:\/\/streamwish\.[^"']+)["']/i)?.[1];
      if (!streamwishEmbed) return null;
      return await extractStreamwishDirect(streamwishEmbed, headers);
    } catch (e) {
      console.warn("Failed to extract from proxy:", proxyUrl, e);
      return null;
    }
  }

  // ✅ استخراج مباشر من streamwish (mp4)
  async function extractStreamwishDirect(embedUrl, headers) {
    try {
      const res = await fetchv2(embedUrl, headers);
      const html = await res.text();
      const sources = [...html.matchAll(/sources:\s*\[\s*\{\s*file:\s*"(https[^"]+\.mp4[^"]*)"/g)];
      const mp4 = sources?.[0]?.[1];
      return mp4 || null;
    } catch (e) {
      console.warn("Failed to extract from streamwish:", embedUrl, e);
      return null;
    }
  }
}

// ✅ دالة fetch v2
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET');
  } catch {
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
