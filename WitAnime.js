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

    const cards = [...html.matchAll(/<div class="anime-card-container">([\s\S]*?)<\/div>\s*<\/div>/g)];

    for (const card of cards) {
      const block = card[1];

      const href = (block.match(/<a[^>]+class="overlay"[^>]+href="([^"]+)"/) || [])[1];
      const img = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1];
      const title = (block.match(/<div class="anime-card-title"[^>]*>[\s\S]*?<h3>\s*<a[^>]*>([^<]+)<\/a>/) || [])[1];

      if (href && img && title) {
        results.push({
          title: decodeHTMLEntities(title.trim()),
          href: href.startsWith('http') ? href : `https://witanime.world${href}`,
          image: img
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
