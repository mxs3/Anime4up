async function searchResults(keyword) {
    const results = [];
    const encoded = encodeURIComponent(keyword);
    const url = `https://anime4up.rest/?s=${encoded}`;

    try {
        const response = await fetchv2(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', // دعم المواقع اللي بتطلب UA
        });
        
        const html = typeof response === 'string' ? response : await response.text();

        // تأكد إننا فعلاً استلمنا HTML نصي
        if (typeof html !== 'string' || !html.includes('anime-card-container')) return results;

        // استخراج البلوكات الخاصة بالأنميات
        const blocks = html.match(/<div class="anime-card-container">[\s\S]*?<\/div>\s*<\/div>/g);
        if (!blocks) return results;

        blocks.forEach(block => {
            const href = block.match(/<a\s+href="([^"]+)"/)?.[1];
            const title = block.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/)?.[1];
            const image = block.match(/<img[^>]+src="([^"]+)"/)?.[1];

            if (href && title && image) {
                results.push({
                    title: decodeHTMLEntities(title.trim()),
                    href: href.trim(),
                    image: image.trim(),
                });
            }
        });
    } catch (e) {
        console.error('Search failed:', e);
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
