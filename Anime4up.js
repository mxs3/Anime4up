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
  const title = decodeHTMLEntities(html.match(/<h1 class="anime-details-title">(.*?)<\/h1>/)?.[1] || '');
  const description = decodeHTMLEntities(html.match(/<p class="anime-story">(.*?)<\/p>/)?.[1] || '');
  const poster = html.match(/<div class="anime-thumbnail">\s*<img[^>]+src="([^"]+)"/)?.[1] || '';
  const type = html.match(/<span>النوع:<\/span>\s*<a[^>]*>(.*?)<\/a>/)?.[1] || '';
  const status = html.match(/<span>حالة الأنمي:<\/span>\s*<a[^>]*>(.*?)<\/a>/)?.[1] || '';
  const releaseDate = html.match(/<span>بداية العرض:<\/span>\s*([^<]+)/)?.[1]?.trim() || '';
  const duration = html.match(/<span>مدة الحلقة:<\/span>\s*([^<]+)/)?.[1]?.trim() || '';
  const totalEpisodes = html.match(/<span>عدد الحلقات:<\/span>\s*([^<]+)/)?.[1]?.trim() || '';
  const season = html.match(/<span>الموسم:<\/span>\s*<a[^>]*>(.*?)<\/a>/)?.[1] || '';
  const source = html.match(/<span>المصدر:<\/span>\s*([^<]+)/)?.[1]?.trim() || '';

  // استخراج التصنيفات
  const genres = [];
  const genreList = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/);
  if (genreList) {
    const liMatches = [...genreList[1].matchAll(/<li>\s*<a[^>]*>(.*?)<\/a>\s*<\/li>/g)];
    for (const match of liMatches) {
      genres.push(match[1].trim());
    }
  }

  // روابط إضافية
  const malId = html.match(/<a[^>]+href="(https:\/\/myanimelist\.net\/anime\/[^"]+)"[^>]*anime-mal/)?.[1] || '';
  const trailer = html.match(/<a[^>]+href="(https:\/\/youtu\.be\/[^"]+)"[^>]*anime-trailer/)?.[1] || '';

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
