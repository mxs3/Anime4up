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
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    'Referer': url
  };

  try {
    // 1. جلب صفحة الحلقة
    const res = await fetch(url, { headers });
    const html = await res.text();

    // 2. استخراج iframes
    const iframes = [...html.matchAll(/<iframe[^>]+src=['"]([^'"]+)['"]/gi)]
      .map(m => m[1].replace(/^\/\//, 'https://'))
      .filter(u => u.includes('streamwish'));

    if (iframes.length === 0) {
      return { error: true, message: 'No StreamWish iframe found' };
    }

    // 3. معالجة كل iframe (سنأخذ الأول فقط كمثال)
    const streamwishUrl = iframes[0];
    
    // 4. استدعاء الدالة الجديدة لاستخراج الرابط الفعلي
    const streamData = await getStreamwishRealUrl(streamwishUrl);
    
    if (streamData.error) {
      return { error: true, message: streamData.error };
    }

    return [{
      url: streamData.url,
      isM3U8: streamData.isM3U8,
      quality: streamData.quality,
      headers: {
        "User-Agent": headers['User-Agent'],
        "Referer": "https://streamwish.fun/"
      }
    }];

  } catch (err) {
    return { error: true, message: `Exception: ${err.message}` };
  }
}

// الدالة المساعدة الجديدة
async function getStreamwishRealUrl(embedUrl) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    'Referer': 'https://witanime.world/'
  };

  try {
    // 1. جلب صفحة الـ embed
    const embedRes = await fetch(embedUrl, { headers });
    const embedHtml = await embedRes.text();

    // 2. استخراج بيانات JWPlayer
    const jwConfigMatch = embedHtml.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\(\)\)/);
    
    if (!jwConfigMatch) {
      throw new Error('JWPlayer configuration not found');
    }

    // 3. فك تشفير التكوين (بدون eval مباشر)
    const decodedConfig = safelyDecodeJWConfig(jwConfigMatch[0]);
    
    if (!decodedConfig?.sources?.[0]?.file) {
      throw new Error('Invalid JWPlayer configuration');
    }

    return {
      url: decodedConfig.sources[0].file,
      isM3U8: true,
      quality: 'auto'
    };

  } catch (error) {
    console.error('StreamWish extraction error:', error);
    return { error: error.message };
  }
}

// بديل آمن لـ eval
function safelyDecodeJWConfig(encoded) {
  try {
    // هذه دالة مبسطة - قد تحتاج لتعديلها حسب التشفير الفعلي
    const unpacked = encoded
      .replace(/^eval\(function\(p,a,c,k,e,d\)\{/, '')
      .replace(/\}\)\)$/, '');
    
    const configStr = unpacked.match(/\{[\s\S]+\}/)?.[0];
    return JSON.parse(configStr);
  } catch (e) {
    console.error('Decoding failed:', e);
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
