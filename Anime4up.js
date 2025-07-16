async function searchResults(keyword) {
  try {
    const searchUrl = `https://4i.nxdwle.shop/?s=${encodeURIComponent(keyword)}`;
    const res       = await fetchv2(searchUrl);
    const html      = await res.text();
    const results   = [];

    // نجمع كل البطاقات التي تبدأ بـ anime-card-container
    const cardRegex = /<div class="anime-card-container">([\s\S]*?)<\/div>\s*<\/div>/g;
    let cardMatch;

    while ((cardMatch = cardRegex.exec(html)) !== null) {
      const card = cardMatch[1];

      // الرابط داخل overlay
      const hrefMatch  = card.match(/<a href="([^"]+)"\s+class="overlay"/);
      // الصورة داخل <img src="...">
      const imgMatch   = card.match(/<img[^>]+src="([^"]+)"/);
      // العنوان داخل h3 > a
      const titleMatch = card.match(/<h3>\s*<a[^>]*>([^<]+)<\/a>\s*<\/h3>/);

      if (hrefMatch && imgMatch && titleMatch) {
        const href     = hrefMatch[1].trim();
        const image    = imgMatch[1].trim();
        const rawTitle = titleMatch[1].trim();
        const title    = decodeHTMLEntities(rawTitle);

        // نتأكد أنها بطاقة أنمي فعلية
        if (href.includes("/anime/")) {
          results.push({ title, href, image });
        }
      }
    }

    // نرجع JSON string كما يتطلب Sora
    return JSON.stringify(results);
  } catch (err) {
    console.error("Anime4up search error:", err);
    return JSON.stringify([]);
  }
}

// دالة مساعدة لفك ترميزات HTML
function decodeHTMLEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
