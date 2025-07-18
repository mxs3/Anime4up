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
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Referer': 'https://4s.qerxam.shop/'
      }
    });

    const html = await res.text();

    const details = {
      description: 'غير متوفر',
      airdate: 'غير معروف',
      genres: []
    };

    // الوصف
    const descMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/);
    if (descMatch && descMatch[1].trim()) {
      details.description = decodeHTMLEntities(descMatch[1].trim());
    }

    // تاريخ العرض
    const airdateMatch = html.match(/<span>بداية العرض:<\/span>\s*([0-9]+)/);
    if (airdateMatch && airdateMatch[1].trim()) {
      details.airdate = airdateMatch[1].trim();
    }

    // التصنيفات
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      if (genreItems.length > 0) {
        details.genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      }
    }

    return JSON.stringify(details);
  } catch (err) {
    console.error("extractDetails error:", err);
    return JSON.stringify({
      description: 'خطأ أثناء التحميل',
      airdate: 'غير معروف',
      genres: []
    });
  }
}
