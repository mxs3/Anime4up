async function searchResults(keyword) {
    try {
        const searchUrl = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
        const res = await fetchv2(searchUrl);
        const html = await res.text();

        const results = [];

        const itemRegex = /<h2><a href="(https:\/\/4s\.qerxam\.shop\/[^"]+)">([^<]+)<\/a><\/h2>[\s\S]+?<img[^>]+src="([^"]+)"[^>]*>/g;
        let match;

        while ((match = itemRegex.exec(html)) !== null) {
            const url = match[1].trim();
            const title = decodeHTMLEntities(match[2].trim());
            const image = match[3].trim();

            // استبعاد نتائج المؤلفين أو التصنيفات
            if (!url.includes("/author/") && !url.includes("/category/")) {
                results.push({ title, url, image });
            }
        }

        return results;
    } catch (err) {
        console.error("Search error:", err);
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
