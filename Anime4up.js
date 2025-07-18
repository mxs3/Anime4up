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
function extractDetails(html) {
  const details = {
    description: "غير متوفر",
    airdate: "غير معروف",
    genres: []
  };

  // الوصف
  const descriptionMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/);
  if (descriptionMatch && descriptionMatch[1]) {
    details.description = decodeHTMLEntities(descriptionMatch[1].trim());
  }

  // سنة العرض
  const airdateMatch = html.match(/<span>\s*بداية العرض:\s*<\/span>\s*([0-9]+)/);
  if (airdateMatch && airdateMatch[1]) {
    details.airdate = airdateMatch[1].trim();
  }

  // التصنيفات
  const genresBlockMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/);
  if (genresBlockMatch) {
    const genreMatches = [...genresBlockMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
    details.genres = genreMatches.map(m => decodeHTMLEntities(m[1].trim()));
  }

  return JSON.stringify(details);
}
