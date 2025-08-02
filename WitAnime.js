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

async function extractStreamUrl(html) {
  const iframeMatches = [...html.matchAll(
    /<a[^>]+onclick=["']loadIframe\(this\)["'][^>]+data-src=["']([^"']+)["'][^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi
  )];

  if (!iframeMatches.length) throw new Error("❌ لا يوجد سيرفرات متاحة");

  const results = [];

  for (const match of iframeMatches) {
    const iframeUrl = match[1].startsWith('http') ? match[1] : 'https:' + match[1];
    const serverName = match[2].trim().toLowerCase();

    try {
      let extracted;

      if (serverName.includes("streamwish")) {
        extracted = await streamwishExtractor(iframeUrl);
      } else if (serverName.includes("videa")) {
        extracted = await videaExtractor(iframeUrl);
      } else if (serverName.includes("dailymotion")) {
        extracted = await dailymotionExtractor(iframeUrl);
      }

      if (extracted?.url) {
        results.push({ name: serverName, url: extracted.url });
      }

    } catch (e) {
      console.log(`❌ خطأ في استخراج ${serverName}:`, e);
    }
  }

  if (!results.length) throw new Error('❌ لم يتم استخراج أي روابط فيديو');

  if (results.length === 1) return results[0].url;

  const chosen = await showQuickMenu(
    results.map(r => ({ title: r.name, value: r.url })),
    "اختر سيرفر للمشاهدة"
  );

  if (!chosen) throw new Error('❌ لم يتم اختيار سيرفر');
  return chosen;
}

async function streamwishExtractor(embedUrl) {
  try {
    const res = await fetchv2(embedUrl, {
      'User-Agent': 'Mozilla/5.0',
      'Referer': embedUrl
    });
    const html = await res.text();

    const fileMatch = html.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/);
    if (fileMatch) {
      return { server: 'streamwish', url: fileMatch[1] };
    }

    const mp4Fallback = html.match(/https?:\/\/[^\s"']+\.mp4/);
    if (mp4Fallback) {
      return { server: 'streamwish', url: mp4Fallback[0] };
    }

  } catch (err) {
    console.log('❌ Streamwish Error:', err);
  }
}

async function videaExtractor(embedUrl) {
  try {
    const vcode = embedUrl.match(/[?&]v=([a-zA-Z0-9]+)/)?.[1];
    if (!vcode) return;

    const xmlRes = await fetchv2(`https://videa.hu/player/xml?v=${vcode}`, {
      'User-Agent': 'Mozilla/5.0',
      'Referer': embedUrl
    });

    const xml = await xmlRes.text();
    const videoUrl = xml.match(/<file[^>]*>([^<]+)<\/file>/)?.[1];
    if (videoUrl) {
      return { server: 'videa', url: videoUrl };
    }

  } catch (err) {
    console.log('❌ Videa extractor error:', err);
  }
}

async function dailymotionExtractor(embedUrl) {
  try {
    const res = await fetchv2(embedUrl, {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://witanime.world/'
    });
    const html = await res.text();

    const jsonMatch = html.match(/var\s*__PLAYER_CONFIG__\s*=\s*({.+?});<\/script>/);
    if (!jsonMatch) return;

    const json = JSON.parse(jsonMatch[1]);
    const qualities = json.metadata?.qualities;

    const streams = Object.values(qualities)
      .flat()
      .filter(v => v.type === 'application/x-mpegURL' || v.type === 'video/mp4');

    if (streams.length) {
      const best = streams.find(v => v.type === 'application/x-mpegURL') || streams[0];
      return { server: 'dailymotion', url: best.url };
    }

  } catch (err) {
    console.log('❌ Dailymotion extractor error:', err);
  }
}

// ✅ دالة fetch v2
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
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
