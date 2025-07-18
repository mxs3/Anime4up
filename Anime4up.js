async function searchResults(keyword) {
    const possibleDomains = [
        "https://anime4up.rest",
        "https://anime4up.bond",
        "https://4i.nxdwle.shop"
    ];

    const results = [];

    for (const base of possibleDomains) {
        const url = `${base}/anime-list-3/`;
        const html = await fetchv2(url);
        if (!html) continue;

        const regex = /<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g;
        let match;

        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const title = decodeHTMLEntities(match[2]);

            if (title.toLowerCase().includes(keyword.toLowerCase())) {
                results.push({
                    title,
                    href,
                    image: `${base}/wp-content/themes/anime/images/logo.png`
                });
            }
        }

        if (results.length > 0) break; // لو جاب نتائج من دومين، نوقف هنا
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
