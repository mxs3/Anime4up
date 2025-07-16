async function searchResults(keyword) {
    const baseUrl = 'https://4i.nxdwle.shop'; // يمكن تغييره لأي دومين شغال
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(keyword)}`;
    
    const html = await soraFetch(searchUrl);
    if (!html) return [];

    const results = [];

    // استخراج كروت الأنمي من نتائج البحث
    const cards = html.match(/<div class="anime-card-container">[\s\S]*?<\/div>\s*<\/div>/g);
    if (!cards) return results;

    for (const card of cards) {
        const hrefMatch = card.match(/<a\s+href="([^"]+\/anime\/[^"]+)"/);
        const titleMatch = card.match(/<div class="anime-card-title"[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/);
        const imgMatch = card.match(/<img[^>]+src="([^"]+)"/);

        if (hrefMatch && titleMatch && imgMatch) {
            const href = hrefMatch[1].trim();
            const rawTitle = titleMatch[1].trim();
            const title = decodeHTMLEntities(rawTitle);
            const image = imgMatch[1].trim();

            results.push({ title, href, image });
        }
    }

    return results;
}

// دالة fetch بديلة تدعم user-agent وتحاول مرتين
async function soraFetch(url, options = {}) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        ...(options.headers || {})
    };

    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, { ...options, headers });
        } catch (err) {
            return null;
        }
    }
}

// دالة فك ترميز HTML Entities
function decodeHTMLEntities(text) {
    return text
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
