function searchResults(html) {
  const results = [];

  const cards = html.match(/<div class="anime-card-container">[\s\S]*?<\/div>\s*<\/div>/g);
  console.log("Total cards found:", cards?.length || 0);
  if (!cards) return JSON.stringify(results);

  cards.forEach(card => {
    const hrefMatch = card.match(/<a href="([^"]+)" class="overlay">/);
    const titleMatch = card.match(/<div class="anime-card-title"[^>]*>\s*<h3><a[^>]*>(.*?)<\/a><\/h3>/);
    const imgMatch = card.match(/<img[^>]+src="([^"]+)"[^>]*>/);

    if (hrefMatch && titleMatch && imgMatch) {
      const href = hrefMatch[1].trim();
      const title = decodeHTMLEntities(titleMatch[1].trim());
      const image = imgMatch[1].trim();

      if (href.includes("/anime/")) {
        results.push({ title, href, image });
      }
    }
  });

  console.log("Results:", results);
  return JSON.stringify(results);
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
