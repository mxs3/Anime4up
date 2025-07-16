async function searchResults(keyword) {
  const baseUrl = "https://4i.nxdwle.shop";
  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(keyword)}`;
  const results = [];

  try {
    const response = await fetchv2(searchUrl);
    const html = await response.text();

    // البوستات الحقيقية فيها "div" بكلاس "AnimeTitle" وليس روابط مؤلفين
    const matches = [...html.matchAll(/<div class="AnimeTitle">[\s\S]*?<a href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?src="([^"]+)"/g)];

    for (const match of matches) {
      const href = match[1].trim();
      const rawTitle = decodeHTMLEntities(match[2].trim());
      const image = match[3].trim();
      const englishTitle = rawTitle.match(/[a-zA-Z0-9:.\-()]+/g)?.join(' ') || rawTitle;

      results.push({
        title: englishTitle,
        href,
        image
      });
    }

    return JSON.stringify(results);
  } catch (err) {
    console.error("searchResults error:", err);
    return JSON.stringify([]);
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
