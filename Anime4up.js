async function searchResults(keyword) {
    const url = 'https://anime4up.rest/anime-list-3/';
    const html = await fetchv2(url);

    if (!html) return [];

    const results = [];
    const regex = /<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
        const href = match[1];
        const title = decodeHTMLEntities(match[2]);

        // طابق الكلمة المفتاحية (بشكل غير حساس لحالة الحروف)
        if (title.toLowerCase().includes(keyword.toLowerCase())) {
            results.push({
                title,
                href,
                image: "https://anime4up.rest/wp-content/themes/anime/images/logo.png" // صورة افتراضية
            });
        }
    }

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
