async function searchResults(keyword) {
  try {
    const encoded = encodeURIComponent(keyword.trim());
    const res = await fetchv2(`https://4s.qerxam.shop/?search_param=animes&s=${encoded}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Referer': 'https://4s.qerxam.shop/'
      }
    });
    const html = await res.text();

    const results = [];
    const regex = /<div class="poster">.*?<img[^>]+src="([^"]+)"[^>]*>.*?<h2 class="title"><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/gs;

    let match;
    while ((match = regex.exec(html)) !== null) {
      const image = match[1].trim();
      const href = match[2].trim();
      const title = decodeHTMLEntities(match[3].trim());

      // تجاهل النتائج الغير متعلقة بأنمي فعلي
      if (!href.includes('/anime/')) continue;

      results.push({ title, href, image });
    }

    if (results.length === 0) {
      return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
    }

    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([{ title: 'Error', href: '', image: '', error: e.message }]);
  }
}

// دالة لفك ترميز HTML
function decodeHTMLEntities(text) {
    return text
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
