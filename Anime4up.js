function searchResults(html) {
  const results = [];

  const cards = html.match(/<div class="anime-card-container">[\s\S]*?<\/div>\s*<\/div>/g);
  if (!cards) return results;

  cards.forEach(card => {
    const hrefMatch = card.match(/<a href="([^"]+)" class="overlay">/);
    const titleMatch = card.match(/<div class="anime-card-title"[^>]*>\s*<h3><a[^>]*>(.*?)<\/a><\/h3>/);
    const imgMatch = card.match(/<img[^>]+src="([^"]+)"[^>]*>/);

    if (hrefMatch && titleMatch && imgMatch) {
      const href = hrefMatch[1].trim();
      const title = decodeHTMLEntities(titleMatch[1].trim());
      const image = imgMatch[1].trim();

      // نتأكد إن الرابط فعلاً يشير لأنمي وليس مؤلف أو تصنيف
      if (href.includes("/anime/")) {
        results.push({ title, href, image });
      }
    }
  });

  return results;
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
