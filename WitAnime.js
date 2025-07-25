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

  const serverMatches = [...html.matchAll(/<li[^>]+data-watch="([^"]+)"/g)];
  const streams = [];

  for (const match of serverMatches) {
    const embed = match[1];
    let serverName = embed.match(/\/\/([^\/]+)/)?.[1] || '';
    serverName = serverName.replace('www.', '').split('.')[0];

    let extracted = [];
    if (serverName.includes('streamwish')) {
      extracted = await extractStreamwish(embed);
    } else if (serverName.includes('ok') || serverName.includes('okru')) {
      extracted = await extractOkru(embed);
    } else if (serverName.includes('videa')) {
      extracted = await extractVidea(embed);
    } else if (serverName.includes('dailymotion')) {
      extracted = await extractDailymotion(embed);
    }

    if (extracted.length) {
      streams.push({
        server: serverName,
        streams: extracted
      });
    }
  }

  return { streams, subtitles: null };

  async function soraFetch(url, options = {}) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Sora)',
        'Referer': url,
        ...options.headers
      }
    });
    return res;
  }

  async function extractStreamwish(embedUrl) {
    const res = await soraFetch(embedUrl);
    const html = await res.text();
    const matches = [...html.matchAll(/file":"([^"]+)".+?label":"([^"]+)"/g)];
    return matches.map(m => ({
      url: m[1].replace(/\\/g, ''),
      quality: m[2],
      headers: { Referer: embedUrl }
    }));
  }

  async function extractOkru(embedUrl) {
    const res = await soraFetch(embedUrl);
    const html = await res.text();
    const json = JSON.parse(html.match(/data-options="([^"]+)"/)?.[1].replace(/&quot;/g, '"') || '{}');
    const videos = json.flashvars?.metadata ? JSON.parse(json.flashvars.metadata) : null;
    if (!videos?.videos) return [];
    return videos.videos.map(v => ({
      url: v.url,
      quality: v.name.toUpperCase(),
      headers: { Referer: embedUrl }
    }));
  }

  async function extractVidea(embedUrl) {
    const res = await soraFetch(embedUrl);
    const html = await res.text();
    const sources = [...html.matchAll(/src="([^"]+\.mp4[^"]*)"/g)];
    return sources.map((m, i) => ({
      url: m[1],
      quality: `SD${sources.length > 1 ? i + 1 : ''}`,
      headers: { Referer: embedUrl }
    }));
  }

  async function extractDailymotion(embedUrl) {
    const res = await soraFetch(embedUrl);
    const html = await res.text();
    const m3u8 = html.match(/"autoURL":"(https:[^"]+\.m3u8)"/)?.[1];
    if (!m3u8) return [];
    return [{ url: m3u8, quality: 'Auto', headers: { Referer: embedUrl } }];
  }

  function _0xCheck() {
    return typeof window !== 'undefined' ? !!window.SoraPlayer : true;
  }
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
