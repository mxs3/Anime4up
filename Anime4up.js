function searchResults(html) {
    const results = [];

    // التقاط العناصر التي تحتوي على كروت الأنمي
    const cards = html.match(/<div class="anime-card-container">[\s\S]*?<\/div>\s*<\/div>/g);
    if (!cards) return results;

    cards.forEach(card => {
        const hrefMatch = card.match(/<a href="([^"]+\/anime\/[^"]+)"/);
        const titleMatch = card.match(/<div class="anime-card-title"[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/);
        const imgMatch = card.match(/<img[^>]+src="([^"]+)"[^>]*>/);

        if (hrefMatch && titleMatch && imgMatch) {
            const href = hrefMatch[1].trim();
            const title = decodeHTMLEntities(titleMatch[1].trim());
            const image = imgMatch[1].trim();

            results.push({ title, href, image });
        }
    });

    return results;
}

// دالة لفك ترميز الكيانات HTML مثل &quot; و &#123;
function decodeHTMLEntities(text) {
    return text
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
