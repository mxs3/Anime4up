function searchResults(html) {
    const results = [];
    
    // تأكد من أن html نص
    if (typeof html !== 'string') return results;

    const blocks = html.match(/<div class="anime-card-container">[\s\S]*?<h3><a href="([^"]+)">([^<]+)<\/a><\/h3>/g);
    
    if (!blocks) return results;

    blocks.forEach(block => {
        const href = block.match(/<a href="([^"]+)"/)?.[1];
        const title = block.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/)?.[1];
        const img = block.match(/<img[^>]+src="([^"]+)"/)?.[1];

        if (href && title && img) {
            results.push({
                title: decodeHTMLEntities(title.trim()),
                href: href.trim(),
                image: img.trim(),
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
