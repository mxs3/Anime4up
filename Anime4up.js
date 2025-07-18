async function searchResults(query) {
  const searchUrl = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(query)}`;
  const html = await fetchv2(searchUrl);
  const $ = cheerio.load(html); // بدون require

  const results = [];

  $('.cat-post-details h2 a').each((_, el) => {
    const title = $(el).text().trim();
    const url = $(el).attr('href');

    if (!url || url.includes('/author/') || url.includes('/category/')) return;

    results.push({
      title,
      url,
    });
  });

  return results;
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
