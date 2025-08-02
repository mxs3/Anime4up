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

async function extractStreamUrl(html, episodeUrl) {
  if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

  const decodeHTMLEntities = (text) => {
    text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
    const entities = { '&quot;': '"', '&amp;': '&', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    for (const entity in entities) {
      text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }
    return text;
  };

  const deobfuscate = (html) => {
    const obfuscatedScript = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    if (!obfuscatedScript) return null;
    return unpack(obfuscatedScript[1]);
  };

  class Unbaser {
    constructor(base) {
      this.ALPHABET = {
        62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
      };
      this.dictionary = {};
      this.base = base;
      if (36 < base && base < 62) {
        this.ALPHABET[base] = this.ALPHABET[base] || this.ALPHABET[62].substr(0, base);
      }
      if (2 <= base && base <= 36) {
        this.unbase = (value) => parseInt(value, base);
      } else {
        [...this.ALPHABET[base]].forEach((cipher, index) => {
          this.dictionary[cipher] = index;
        });
        this.unbase = this._dictunbaser;
      }
    }
    _dictunbaser(value) {
      return [...value].reverse().reduce((acc, cipher, index) =>
        acc + (Math.pow(this.base, index) * this.dictionary[cipher]), 0);
    }
  }

  const unpack = (source) => {
    const _filterargs = (source) => {
      const juicers = [
        /}$begin:math:text$'(.*)', *(\\d+|\\[\\]), *(\\d+), *'(.*)'\\.split\\('\\|'$end:math:text$, *(\d+), *(.*)\)\)/,
        /}$begin:math:text$'(.*)', *(\\d+|\\[\\]), *(\\d+), *'(.*)'\\.split\\('\\|'$end:math:text$/,
      ];
      for (const juicer of juicers) {
        const args = juicer.exec(source);
        if (args) {
          return {
            payload: args[1],
            symtab: args[4].split("|"),
            radix: parseInt(args[2]),
            count: parseInt(args[3]),
          };
        }
      }
      throw new Error("Could not parse p.a.c.k.e.r");
    };
    const _replacestrings = (source) => source;

    const { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) throw new Error("Malformed p.a.c.k.e.r symtab");

    const unbase = new Unbaser(radix);
    const lookup = (match) => symtab[unbase.unbase(match)] || match;
    return _replacestrings(payload.replace(/\b\w+\b/g, lookup));
  };

  const soraFetch = async (url, options = { headers: {}, method: 'GET', body: null }) => {
    try {
      return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch {
      try {
        const res = await fetch(url, options);
        return await res.text();
      } catch {
        return null;
      }
    }
  };

  const servers = [...html.matchAll(
    /<a[^>]+data-server-id=["']?(\d+)["']?[^>]+onclick=["']loadIframe$begin:math:text$this$end:math:text$["'][^>]*>\s*<span[^>]*class=["']ser["']>([^<]+)<\/span>/gi
  )].map(m => ({
    id: m[1],
    name: m[2].trim()
  })).filter(s => !/yonaplay/i.test(s.name));

  const baseUrl = episodeUrl.split('/episode')[0];
  for (const server of servers) {
    const iframeApi = `${baseUrl}/ajax/server.php?id=${server.id}`;
    const iframeHtml = await soraFetch(iframeApi);
    if (!iframeHtml) continue;

    const iframeSrcMatch = iframeHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (!iframeSrcMatch) continue;

    let finalLink = decodeHTMLEntities(iframeSrcMatch[1]);
    if (!finalLink.startsWith('http')) finalLink = 'https:' + finalLink;

    // معالجة iframe داخلي
    const embedHtml = await soraFetch(finalLink);
    if (!embedHtml) continue;

    // لو فيه فيديو مباشر
    const directVideo = embedHtml.match(/<video[^>]+src=["']([^"']+)["']/i);
    if (directVideo) return directVideo[1];

    // لو مشفر eval
    const unpacked = deobfuscate(embedHtml);
    if (unpacked && unpacked.includes("m3u8") || unpacked.includes("mp4")) {
      const videoUrlMatch = unpacked.match(/(https?:\/\/[^\s"'\\]+(?:\.m3u8|\.mp4))/);
      if (videoUrlMatch) return videoUrlMatch[1];
    }

    // لو السيرفر معروف نقدر نعمل استخراج خاص لاحقًا هنا

  }

  return 'https://files.catbox.moe/avolvc.mp4'; // fallback
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
