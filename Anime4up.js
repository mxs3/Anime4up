async function searchResults(keyword) {
    try {
        const query = encodeURIComponent(keyword);
        const searchUrl = `https://4s.qerxam.shop/?search_param=animes&s=${query}`;
        const res = await fetchv2(searchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });

        const html = await res.text();
        const results = [];

        const regex = /<h2><a href="([^"]+)">([^<]+)<\/a><\/h2>[\s\S]*?<img[^>]*src="([^"]+)"/g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            const title = match[2].trim();
            const image = match[3].trim();

            if (href && title) {
                results.push({ title, href, image });
            }
        }

        return results;
    } catch (err) {
        console.log("search error:", err);
        return [];
    }
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
