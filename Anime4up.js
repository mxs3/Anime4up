async function searchResults(keyword) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://4s.qerxam.shop/?search_param=animes&s=${encodedKeyword}`;

    const res = await fetchv2(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Referer': 'https://4s.qerxam.shop/',
      },
    });

    const html = await res.text();
    const results = [];

    const cardRegex = /<div class="anime-card-container">([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;

    while ((match = cardRegex.exec(html)) !== null) {
      const block = match[1];

      const urlMatch = block.match(/<a href="([^"]+)" class="overlay">/);
      const titleMatch = block.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/);
      const imageMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);

      if (urlMatch && titleMatch && imageMatch) {
        results.push({
          title: decodeHTMLEntities(titleMatch[1].trim()),
          href: urlMatch[1],
          image: imageMatch[1],
        });
      }
    }

    if (results.length === 0) {
      return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
    }

    return JSON.stringify(results);
  } catch (error) {
    return JSON.stringify([{ title: 'Error', href: '', image: '', error: error.message }]);
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
