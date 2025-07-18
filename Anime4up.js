async function searchResults(keyword) {
  try {
    const url = `https://anime4up.rest/?s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    const html = await res.text();

    const results = [];
    const pattern = /<div class="anime-card">([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const card = match[1];

      const linkMatch = card.match(/<a[^>]+href="([^"]+)"/);
      const titleMatch = card.match(/<div class="anime-title">([^<]+)<\/div>/);
      const imageMatch = card.match(/<img[^>]+src="([^"]+)"/);

      const link = linkMatch ? linkMatch[1] : null;
      const title = titleMatch ? titleMatch[1].trim() : null;
      const image = imageMatch ? imageMatch[1] : null;

      if (link && title) {
        results.push({
          title,
          url: link,
          image: image || ""
        });
      }
    }

    return results;
  } catch (err) {
    return [];
  }
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
