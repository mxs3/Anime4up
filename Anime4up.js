async function searchResults(keyword) {
    const searchUrl = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        }
    });
    const html = await res.text();

    const results = [];
    const regex = /<div class="anime-card-container">([\s\S]*?)<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<a[^>]+class="overlay"[^>]+href="([^"]+)"[^>]*>[\s\S]*?<div class="anime-card-title"[^>]*>[\s\S]*?<h3><a[^>]*>([^<]+)<\/a>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const image = match[2];
        const href = match[3];
        const title = decodeHTMLEntities(match[4]);
        results.push({ title, href, image });
    }

    if (results.length === 0) {
        return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
    }

    return JSON.stringify(results);
}
