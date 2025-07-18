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
  const results = [];

  try {
    const response = await soraFetch(url);
    const html = await response.text();

    const description = html.match(/<div class="singleDesc">\s*<p>([\s\S]*?)<\/p>/i)?.[1]?.trim() || 'N/A';
    const airdate = html.match(/<i class="far fa-calendar-alt"><\/i>\s*موعد الصدور\s*:\s*(\d{4})/i)?.[1] || 'N/A';
    const aliasContainer = html.match(/<i class="far fa-folders"><\/i>\s*تصنيف المسلسل\s*:\s*([\s\S]*?)<\/span>/i)?.[1];

    let aliases = [];
    if (aliasContainer) {
      const matches = [...aliasContainer.matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      aliases = matches.map(m => decodeHTMLEntities(m[1].trim())).filter(Boolean);
    }

    results.push({
      description: decodeHTMLEntities(description),
      airdate,
      aliases: aliases.length ? aliases.join(', ') : 'N/A'
    });

    return JSON.stringify(results);

  } catch (error) {
    console.error('Error extracting details:', error);
    return JSON.stringify([{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
  }
}

async function extractEpisodes(url) {
  try {
    const pageResponse = await soraFetch(url);
    const html = typeof pageResponse === 'object' ? await pageResponse.text() : pageResponse;

    const episodes = [];

    // للأفلام
    if (/\/(movies|anime-movies|asian-movies|dubbed-movies)\//.test(url)) {
      episodes.push({ number: 1, href: url });
      return JSON.stringify(episodes);
    }

    const seasonUrls = [];
    let seasonMatch;
    const seasonRegex = /<div\s+class="seasonDiv[^"]*"\s+onclick="window\.location\.href\s*=\s*'\/\?p=(\d+)'"/g;
    while ((seasonMatch = seasonRegex.exec(html)) !== null) {
      seasonUrls.push(`${DECODED.BASE}/?p=${seasonMatch[1]}`);
    }

    const episodeRegex = /<a href="([^"]+)"[^>]*>\s*الحلقة\s+(\d+)\s*<\/a>/g;

    if (seasonUrls.length === 0) {
      for (const match of html.matchAll(episodeRegex)) {
        episodes.push({ number: parseInt(match[2]), href: match[1] });
      }
    } else {
      const seasonHtmls = await Promise.all(
        (await Promise.all(seasonUrls.map(url => soraFetch(url))))
          .map(res => res.text?.() || res)
      );

      for (const seasonHtml of seasonHtmls) {
        for (const match of seasonHtml.matchAll(episodeRegex)) {
          episodes.push({ number: parseInt(match[2]), href: match[1] });
        }
      }
    }

    return JSON.stringify(episodes);
  } catch (error) {
    console.error("extractEpisodes failed:", error);
    return JSON.stringify([]);
  }
}
