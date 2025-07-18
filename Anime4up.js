function decodeHTMLEntities(text) {
    const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&quot;': '"' };
    return text.replace(/&[#\w]+;/g, match => entities[match] || match);
}

async function searchResults(keyword) {
    try {
        const url = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
        const res = await fetchv2(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
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

function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#8211;': '–',
    '&#8217;': '’',
    '&#8220;': '“',
    '&#8221;': '”',
  };
  return text.replace(/&[#A-Za-z0-9]+;/g, (entity) => entities[entity] || entity);
}

function extractDetails(html) {
  function extract(regex, group = 1) {
    const match = html.match(regex);
    return match ? decodeHTMLEntities(match[group]) : '';
  }

  function extractList(regex) {
    const matches = [...html.matchAll(regex)];
    return matches.map(m => decodeHTMLEntities(m[1].trim()));
  }

  const title = extract(/<h1 class="anime-details-title">(.*?)<\/h1>/);
  const description = extract(/<p class="anime-story">(.*?)<\/p>/);
  const poster = extract(/<div class="anime-thumbnail">\s*<img[^>]+src="([^"]+)"/);
  const type = extract(/<span>النوع:<\/span>\s*<a[^>]*>(.*?)<\/a>/);
  const status = extract(/<span>حالة الأنمي:<\/span>\s*<a[^>]*>(.*?)<\/a>/);
  const releaseDate = extract(/<span>بداية العرض:<\/span>\s*([^<]+)/);
  const duration = extract(/<span>مدة الحلقة:<\/span>\s*([^<]+)/);
  const totalEpisodes = extract(/<span>عدد الحلقات:<\/span>\s*([^<]+)/);
  const season = extract(/<span>الموسم:<\/span>\s*<a[^>]*>(.*?)<\/a>/);
  const source = extract(/<span>المصدر:<\/span>\s*([^<]+)/);

  const genres = extractList(/<ul class="anime-genres">[\s\S]*?<li>\s*<a[^>]*>(.*?)<\/a>\s*<\/li>/g);
  const malId = extract(/<a[^>]+href="(https:\/\/myanimelist\.net\/anime\/[^"]+)"[^>]*class="anime-mal"/);
  const trailer = extract(/<a[^>]+href="(https:\/\/youtu\.be\/[^"]+)"[^>]*class="anime-trailer"/);

  return JSON.stringify({
    title,
    description,
    poster,
    type,
    status,
    releaseDate,
    duration,
    totalEpisodes,
    season,
    source,
    genres,
    malId,
    trailer
  });
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
  };
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}
