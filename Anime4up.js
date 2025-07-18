// ✅ دالة فك ترميز الكيانات (HTML Entities) — نسخة واحدة فقط
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

// ✅ دالة البحث
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

// ✅ دالة استخراج التفاصيل
async function extractDetails(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();

    const title = decodeHTMLEntities(html.match(/<h1 class="anime-details-title">(.*?)<\/h1>/)?.[1] || 'N/A');
    const description = decodeHTMLEntities(html.match(/<p class="anime-story">(.*?)<\/p>/)?.[1] || 'N/A');
    const poster = html.match(/<div class="anime-thumbnail">[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1] || '';
    const type = html.match(/<span>النوع:<\/span>\s*<a[^>]*>([^<]+)<\/a>/)?.[1] || 'N/A';
    const status = html.match(/<span>حالة الأنمي:<\/span>\s*<a[^>]*>([^<]+)<\/a>/)?.[1] || 'N/A';
    const releaseDate = html.match(/<span>بداية العرض:<\/span>\s*([^<]+)/)?.[1]?.trim() || 'N/A';
    const duration = html.match(/<span>مدة الحلقة:<\/span>\s*([^<]+)/)?.[1]?.trim() || 'N/A';
    const totalEpisodes = html.match(/<span>عدد الحلقات:<\/span>\s*([^<]+)/)?.[1]?.trim() || 'N/A';
    const season = html.match(/<span>الموسم:<\/span>\s*<a[^>]*>([^<]+)<\/a>/)?.[1] || 'N/A';
    const source = html.match(/<span>المصدر:<\/span>\s*([^<]+)/)?.[1]?.trim() || 'N/A';

    const genres = [];
    const genreList = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/);
    if (genreList) {
      const genreMatches = [...genreList[1].matchAll(/<li>\s*<a[^>]*>([^<]+)<\/a>/g)];
      for (const match of genreMatches) {
        genres.push(decodeHTMLEntities(match[1]));
      }
    }

    const trailer = html.match(/<a[^>]+href="(https:\/\/youtu\.be\/[^"]+)"[^>]*anime-trailer/)?.[1] || '';
    const malId = html.match(/<a[^>]+href="(https:\/\/myanimelist\.net\/anime\/[^"]+)"[^>]*anime-mal/)?.[1] || '';

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
      trailer,
      malId
    });
  } catch (e) {
    console.error("extractDetails error:", e);
    return JSON.stringify({
      title: 'N/A',
      description: 'N/A',
      poster: '',
      type: 'N/A',
      status: 'N/A',
      releaseDate: 'N/A',
      duration: 'N/A',
      totalEpisodes: 'N/A',
      season: 'N/A',
      source: 'N/A',
      genres: [],
      trailer: '',
      malId: ''
    });
  }
}

// ✅ دالة استخراج الحلقات
async function extractEpisodes(url) {
  try {
    const res = await soraFetch(url);
    const html = await res.text();

    const episodes = [];
    const matches = [...html.matchAll(/<a href="([^"]+)"[^>]*>\s*الحلقة\s*(\d+)\s*<\/a>/g)];
    for (const match of matches) {
      episodes.push({
        number: parseInt(match[2]),
        href: match[1]
      });
    }

    return JSON.stringify(episodes);
  } catch (e) {
    console.error("extractEpisodes error:", e);
    return JSON.stringify([]);
  }
}
