async function searchResults(keyword) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://4i.nxdwle.shop/?s=${encodedKeyword}`;
    const response = await fetchv2(searchUrl);
    const html = await response.text();

    const results = [];

    const itemBlocks = html.match(/<div class="MovieItem">[\s\S]*?<h4>(.*?)<\/h4>[\s\S]*?<\/a>/g);
    if (!itemBlocks) return JSON.stringify([]);

    for (const block of itemBlocks) {
      const hrefMatch = block.match(/<a href="([^"]+)"/);
      const titleMatch = block.match(/<h4>(.*?)<\/h4>/);
      const imgMatch = block.match(/background-image:\s*url\(([^)]+)\)/);

      if (hrefMatch && titleMatch && imgMatch) {
        const href = hrefMatch[1].trim();
        const rawTitle = decodeHTMLEntities(titleMatch[1].trim());
        const image = imgMatch[1].trim();

        // نحتفظ بالعنوان الإنجليزي فقط إن وجد، وإلا نرجع الأصلي
        const englishTitle = rawTitle.match(/[a-zA-Z0-9:.\-()]+/g)?.join(' ') || rawTitle;

        results.push({ title: englishTitle.trim(), href, image });
      }
    }

    return JSON.stringify(results);
  } catch (err) {
    console.error("Anime4up search error:", err);
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
