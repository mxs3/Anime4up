async function searchResults(keyword) {
  try {
    const url = `https://witanime.world/?s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://witanime.world/',
        'Accept-Language': 'ar,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    const html = await res.text();

    const results = [];
    const regex = /<div class="anime-card-container">([\s\S]*?)<\/div>\s*<\/div>/g;
    const matches = [...html.matchAll(regex)];

    for (const match of matches) {
      const block = match[1];

      const hrefMatch = block.match(/<a[^>]+class="overlay"[^>]+href="([^"]+)"/i);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
      const titleMatch = block.match(/<div class="anime-card-title"[^>]*>[\s\S]*?<h3>\s*<a[^>]*>([^<]+)<\/a>/i);

      if (hrefMatch && imgMatch && titleMatch) {
        results.push({
          title: decodeHTMLEntities(titleMatch[1].trim()),
          href: hrefMatch[1].startsWith('http') ? hrefMatch[1] : `https://witanime.world${hrefMatch[1]}`,
          image: imgMatch[1]
        });
      }
    }

    if (results.length === 0) {
      return JSON.stringify([{ title: 'لا توجد نتائج', href: '', image: '' }]);
    }

    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([{ title: 'حدث خطأ أثناء البحث', href: '', image: '', error: err.message }]);
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

    const airdateMatch = html.match(/<div class="anime-info"><span>بداية العرض:<\/span>\s*(\d{4})/i);
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

function decodeHTMLEntities(text) {
  try {
    return text
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
      .replace(/&#x([\da-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  } catch {
    return text;
  }
}
