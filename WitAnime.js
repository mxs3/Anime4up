async function searchResults(query) {
  const url = `https://witanime.world/?search_param=animes&s=${encodeURIComponent(query)}`;
  const res = await fetchv2(url);
  const html = await res.text();
  const results = [];
  const regex = /<div class="anime-card-container">([\s\S]*?)<\/div>\s*<\/div>/g;

  for (const match of html.matchAll(regex)) {
    const block = match[1];
    const linkMatch = block.match(/<a\s+href="([^"]+)"[^>]*>/);
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
    const titleMatch = block.match(/<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);

    if (linkMatch && titleMatch) {
      results.push({
        title: decodeHTMLEntities(titleMatch[1].trim()),
        url: linkMatch[1],
        image: imgMatch ? imgMatch[1] : null
      });
    }
  }

  return JSON.stringify(results);
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
    '&#39;': "'"
  };
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}
