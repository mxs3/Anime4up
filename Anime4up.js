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

  const html = await soraFetch(url).then(res => res.text());
  const matches = [...html.matchAll(/data-ep-url="([^"]+).+?>([^<]+)/g)];

  const servers = matches.map(m => {
    let link = m[1].startsWith('//') ? 'https:' + m[1] : m[1];
    let name = m[2].trim();
    let type = link.includes('uqload') ? 'uqload' :
               link.includes('vidmoly') ? 'vidmoly' :
               link.includes('mp4upload') ? 'mp4upload' : null;
    return type ? { link, name, type } : null;
  }).filter(Boolean);

  const priority = { uqload: 0, vidmoly: 1, mp4upload: 2 };
  const sorted = servers.sort((a, b) => priority[a.type] - priority[b.type]);

  const results = [];

  for (const { link, name, type } of sorted) {
    let streams = [];

    if (type === 'uqload') {
      streams = await extractUqload(link);
    } else if (type === 'vidmoly') {
      streams = await extractVidmoly(link);
    } else if (type === 'mp4upload') {
      streams = await extractMp4upload(link);
    }

    for (const s of streams) {
      results.push({ ...s, title: `${name} - ${s.title}` });
    }
  }

  return results;
}

async function extractUqload(url) {
  if (!url.includes('/embed-')) {
    const id = url.split('/').pop().replace('.html', '');
    url = `https://uqload.io/embed-${id}.html`;
  }
  const html = await soraFetch(url, { headers: { Referer: url } }).then(res => res.text());
  const match = html.match(/sources:\s*\[\{file:"([^"]+)/);
  if (!match) return [];
  return [{ title: 'SD', streamUrl: match[1], headers: { Referer: url } }];
}

async function extractVidmoly(url) {
  if (!url.includes('/embed-')) {
    const id = url.split('/').pop().replace('.html', '');
    url = `https://vidmoly.to/embed-${id}.html`;
  }
  const html = await soraFetch(url, { headers: { Referer: url } }).then(res => res.text());
  const matches = [...html.matchAll(/file:\s*['"]([^'"]+\.mp4[^'"]*)['"]\s*,\s*label:\s*['"]([^'"]+)/g)];
  return matches.map(m => ({ title: m[2], streamUrl: m[1], headers: { Referer: url } }));
}

async function extractMp4upload(url) {
  if (!url.includes('/embed-')) {
    const id = url.split('/').pop().replace('.html', '');
    url = `https://www.mp4upload.com/embed-${id}.html`;
  }
  const html = await soraFetch(url, { headers: { Referer: url } }).then(res => res.text());
  const unpacked = extractScript(html);
  const match = unpacked.match(/player\.src\("([^"]+)/);
  if (!match) return [];
  return [{ title: 'SD', streamUrl: match[1], headers: { Referer: url } }];
}

function soraFetch(url, opt = {}) {
  return fetch(url, {
    ...opt,
    headers: {
      'User-Agent': _0x7E9A(),
      ...(opt.headers || {})
    }
  });
}

function _0xCheck() {
  return typeof _0x7E9A === 'function';
}

function _0x7E9A() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
         "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
}

function extractScript(html) {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, script] of scripts) {
    if (/eval\(function\(p,a,c,k,e/.test(script)) {
      return unpack(script);
    }
  }
  return '';
}

function unpack(s) {
  try {
    return new Function('return ' + s.match(/eval\(function\(p,a,c,k,e,d\).*?}\('(.*?)'\)/s)?.[0])();
  } catch {
    return '';
  }
}

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
