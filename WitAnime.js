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
    if (!_0xCheck()) return 'https://files.catbox.moe/avolvc.mp4';

    const multiStreams = { streams: [], subtitles: null };

    const serverMatches = [...html.matchAll(/<li[^>]+data-watch="([^"]+)"/g)];
    if (!serverMatches || serverMatches.length === 0) return JSON.stringify(multiStreams);

    const priority = ['vidmoly', 'uqload', 'mp4upload', 'sendvid'];

    const sortedMatches = serverMatches.sort((a, b) => {
        const aIndex = priority.findIndex(s => a[1].includes(s));
        const bIndex = priority.findIndex(s => b[1].includes(s));
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    for (const match of sortedMatches) {
        const embedUrl = match[1].trim();
        let streams = [];

        if (embedUrl.includes('vidmoly')) streams = await extractVidmoly(embedUrl);
        else if (embedUrl.includes('mp4upload')) streams = await extractMp4upload(embedUrl);
        else if (embedUrl.includes('uqload')) streams = await extractUqload(embedUrl);
        else if (embedUrl.includes('sendvid')) streams = await extractSendvid(embedUrl);

        const baseName = embedUrl.includes('vidmoly') ? 'Vidmoly (Auto)'
                         : embedUrl.includes('mp4upload') ? 'Mp4upload (1080)'
                         : embedUrl.includes('uqload') ? 'Uqload (480)'
                         : embedUrl.includes('sendvid') ? 'Sendvid (720)'
                         : 'Server';

        for (const s of streams) {
            multiStreams.streams.push({
                title: baseName,
                streamUrl: s.url,
                headers: s.headers ?? {
                    Referer: embedUrl,
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
                },
                subtitles: null
            });
        }
    }

    return JSON.stringify(multiStreams);
}

// Helpers

async function soraFetch(url, options) {
    return await fetch(url, options);
}

async function extractVidmoly(embedUrl) {
    const res = await soraFetch(embedUrl, { headers: { Referer: embedUrl } });
    const html = await res.text();
    const match = html.match(/sources:\s*\[\s*\{file:\s*['"]([^'"]+)['"]/);
    if (!match) return [];
    return [{ url: match[1], quality: 'Auto' }];
}

async function extractMp4upload(embedUrl) {
    const res = await soraFetch(embedUrl, { headers: { Referer: embedUrl } });
    const html = await res.text();
    const match = html.match(/player\.src\(\{\s*type:\s*['"]video\/mp4['"],\s*src:\s*['"]([^'"]+)['"]/);
    if (!match) return [];
    return [{ url: match[1], quality: 'Auto' }];
}

async function extractUqload(embedUrl) {
    const res = await soraFetch(embedUrl, {
        headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
        }
    });
    const html = await res.text();

    const match = html.match(/sources:\s*\[\s*"([^"]+\.mp4)"/i);
    if (!match) return [];

    return [{
        url: match[1],
        quality: 'Auto',
        headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
        }
    }];
}

async function extractSibnet(embedUrl) {
    const res = await soraFetch(embedUrl, {
        headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
        }
    });
    const html = await res.text();

    const match = html.match(/player\.src\(\{\s*type:\s*["']video\/mp4["'],\s*src:\s*["']([^"']+)["']/i);
    if (match) {
        return [{
            url: match[1],
            quality: 'Auto',
            headers: {
                Referer: embedUrl,
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
            }
        }];
    }

    return [];
}

async function extractSendvid(embedUrl) {
    const res = await soraFetch(embedUrl, {
        headers: {
            Referer: embedUrl,
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
        }
    });
    const html = await res.text();

    // نحاول نلقط من <meta property="og:video">
    const metaMatch = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+\.mp4[^"']*)["']/i);
    if (metaMatch) {
        return [{
            url: metaMatch[1],
            quality: 'Auto',
            headers: {
                Referer: embedUrl,
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
            }
        }];
    }

    // fallback: نحاول نلقط من <source src=...>
    const sourceMatch = html.match(/<source\s+src=["']([^"']+\.mp4[^"']*)["']/i);
    if (sourceMatch) {
        return [{
            url: sourceMatch[1],
            quality: 'Auto',
            headers: {
                Referer: embedUrl,
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
            }
        }];
    }

    return [];
}

async function extractListeamed(embedUrl) {
    const res = await soraFetch(embedUrl, { headers: { Referer: embedUrl } });
    const html = await res.text();
    const m = html.match(/source\s+src="([^"]+\.mp4)"/);
    if (!m) return [];
    return [{ url: m[1], quality: 'Auto' }];
}

async function extractPlayerwish(embedUrl) {
    const res = await soraFetch(embedUrl, { headers: { Referer: embedUrl } });
    const html = await res.text();
    const m = html.match(/"file":"([^"]+\.mp4)"/);
    if (!m) return [];
    return [{ url: m[1].replace(/\\/g, ''), quality: 'Auto' }];
}

function _0xCheck() {
    return typeof soraFetch !== 'undefined';
}

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    
    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };
    
    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}

function _0xCheck() {
    var _0x1a = typeof _0xB4F2 === 'function';
    var _0x2b = typeof _0x7E9A === 'function';
    return _0x1a && _0x2b ? (function(_0x3c) {
        return _0x7E9A(_0x3c);
    })(_0xB4F2()) : !1;
}

function _0x7E9A(_){return((___,____,_____,______,_______,________,_________,__________,___________,____________)=>(____=typeof ___,_____=___&&___[String.fromCharCode(...[108,101,110,103,116,104])],______=[...String.fromCharCode(...[99,114,97,110,99,105])],_______=___?[...___[String.fromCharCode(...[116,111,76,111,119,101,114,67,97,115,101])]()]:[],(________=______[String.fromCharCode(...[115,108,105,99,101])]())&&_______[String.fromCharCode(...[102,111,114,69,97,99,104])]((_________,__________)=>(___________=________[String.fromCharCode(...[105,110,100,101,120,79,102])](_________))>=0&&________[String.fromCharCode(...[115,112,108,105,99,101])](___________,1)),____===String.fromCharCode(...[115,116,114,105,110,103])&&_____===16&&________[String.fromCharCode(...[108,101,110,103,116,104])]===0))(_)}
