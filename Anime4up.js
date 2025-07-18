function decodeHTMLEntities(text) {
    const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&quot;': '"' };
    return text.replace(/&[#\w]+;/g, match => entities[match] || match);
}

async function searchResults(keyword) {
    try {
        const url = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
        const res = await fetchv2(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Referer': 'https://4s.qerxam.shop/'
            }
        });
        const html = await res.text();

        const results = [];
        const blocks = html.split('anime-card-container');
        for (const block of blocks) {
            const hrefMatch = block.match(/<a href="([^"]+\/anime\/[^"]+)"/);
            const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
            const titleMatch = block.match(/anime-card-title[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/);

            if (hrefMatch && imgMatch && titleMatch) {
                results.push({
                    title: decodeHTMLEntities(titleMatch[1]),
                    href: hrefMatch[1],
                    image: imgMatch[1]
                });
            }
        }

        if (results.length === 0) {
            return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ title: 'Error', href: '', image: '', error: err.message }]);
    }
}

function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#8211;': '–',
    '&#8217;': '’',
    '&#8220;': '“',
    '&#8221;': '”',
  };
  return text.replace(/&[#A-Za-z0-9]+;/g, (entity) => entities[entity] || entity);
}
