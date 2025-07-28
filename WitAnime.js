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
  const sources = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  };

  const iframeMatches = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)];
  for (const match of iframeMatches) {
    let iframeUrl = match[1].trim();
    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
    if (!iframeUrl.startsWith('http')) continue;

    try {
      const res = await soraFetch(iframeUrl, { headers });
      const frameHtml = await res.text();

      // ✅ streamwish
      if (/streamwish/.test(iframeUrl)) {
        const unpacked = unpackEval(frameHtml);
        const fileMatch = unpacked?.match(/sources\s*:\s*\[\s*\{[^}]*file\s*:\s*["']([^"']+)["']/);
        if (fileMatch) {
          sources.push({
            url: fileMatch[1],
            isM3U8: fileMatch[1].includes('.m3u8'),
            quality: 'auto',
            headers
          });
          continue;
        }
      }

      // ✅ krava / tryzendm
      if (/krava|tryzendm/.test(iframeUrl)) {
        const unpacked = unpackEval(frameHtml);
        const fileMatch = unpacked?.match(/file\s*:\s*["'](https?:\/\/[^"']+\.(mp4|m3u8)[^"']*)["']/);
        if (fileMatch) {
          sources.push({
            url: fileMatch[1],
            isM3U8: fileMatch[1].includes('.m3u8'),
            quality: 'auto',
            headers
          });
          continue;
        }
      }

      // ✅ dailymotion
      if (/dailymotion/.test(iframeUrl)) {
        const id = iframeUrl.match(/video\/([^_&#?/]+)/)?.[1];
        if (id) {
          const embed = `https://geo.dailymotion.com/player/xtv3w.html?video=${id}`;
          sources.push({
            url: embed,
            isM3U8: true,
            quality: 'auto',
            headers
          });
          continue;
        }
      }

    } catch (err) {
      console.warn('[iframe error]', iframeUrl, err.message);
    }
  }

  if (sources.length === 0) {
    return JSON.stringify([
      {
        url: 'fallback',
        isM3U8: false,
        quality: 'fallback'
      }
    ]);
  }

  return JSON.stringify(sources);
}

function unpackEval(code) {
  try {
    const evalMatch = code.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\)\)/);
    if (!evalMatch) return null;
    return unpack(evalMatch[0]);
  } catch (e) {
    console.warn('[unpackEval error]', e.message);
    return null;
  }
}

function unpack(packed) {
  try {
    const argsMatch = packed.match(/eval\(function\(p,a,c,k,e,d\)\{.*?}\((.*?)\)\)/);
    if (!argsMatch) return null;

    const args = argsMatch[1].split(',');
    const p = eval(args[0]);
    const a = parseInt(args[1]);
    const k = eval(args[3]);
    const unbase = unbaser(a);

    return p.replace(/\b\w+\b/g, word => {
      const value = unbase(word);
      return k[value] || word;
    });
  } catch (e) {
    console.warn('[unpack error]', e.message);
    return null;
  }
}

function unbaser(base) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return function (str) {
    return str.split('').reverse().reduce((acc, val, i) => {
      return acc + alphabet.indexOf(val) * Math.pow(base, i);
    }, 0);
  };
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
