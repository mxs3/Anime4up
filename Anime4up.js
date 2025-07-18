function searchResults(html) {
    if (!html || typeof html !== 'string' || html.length < 100) {
        return [];
    }

    const results = [];

    const itemBlocks = html.match(/<div class="anime-card[^"]*">[\s\S]*?<\/div>\s*<\/div>/g);
    if (!itemBlocks) return [];

    itemBlocks.forEach(block => {
        const urlMatch = block.match(/<a\s+href="([^"]+)"/);
        const titleMatch = block.match(/<div class="anime-title">([^<]+)<\/div>/);
        const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);

        const url = urlMatch?.[1]?.trim();
        const titleRaw = titleMatch?.[1]?.trim() ?? '';
        const image = imgMatch?.[1]?.trim() ?? '';
        const title = decodeHTMLEntities(titleRaw);

        if (url && title && !url.includes("/category/")) {
            results.push({
                title: title,
                image: image,
                url: url
            });
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
