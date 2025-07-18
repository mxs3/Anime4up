async function searchResults(keyword) {
    const base = "https://anime4up.rest";
    const searchUrl = `${base}/?s=${encodeURIComponent(keyword)}`;

    try {
        const response = await fetchv2(searchUrl);
        const html = await response.text();

        if (!html || html.length < 100) return []; // تأكيد إن فيه بيانات

        const results = [];
        const cardRegex = /<div class="anime-card[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            const block = match[1];

            const urlMatch = block.match(/<a\s+href="([^"]+)"/);
            const titleMatch = block.match(/<div class="anime-title">([^<]+)<\/div>/);
            const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

            const url = urlMatch?.[1]?.trim();
            const titleRaw = titleMatch?.[1]?.trim() ?? '';
            const image = imgMatch?.[1]?.trim() ?? '';
            const title = decodeHTMLEntities(titleRaw);

            if (url && title && !url.includes("/category/")) {
                results.push({ title, image, url });
            }
        }

        return results.length > 0 ? results : [];
    } catch (err) {
        console.log("Anime4up search error:", err);
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
