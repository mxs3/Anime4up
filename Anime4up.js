async function searchResults(keyword) {
    const searchUrl = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    
    const response = await fetchv2(searchUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html",
        }
    });
    
    const html = await response.text();
    const $ = cheerio.load(html);

    const results = [];

    $('h2 > a').each((i, el) => {
        const title = $(el).text().trim();
        const url = $(el).attr('href');
        if (url.includes('/episode/')) { // تأكد إننا بنتعامل مع حلقات
            results.push({
                title,
                url
            });
        }
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
