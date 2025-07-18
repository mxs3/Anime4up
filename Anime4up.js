async function searchResults(keyword) {
    const multiDomains = [
        "https://4i.nxdwle.shop",
        "https://anime4up.rest",
        "https://anime4up.bond"
    ];

    for (const domain of multiDomains) {
        try {
            const searchUrl = `${domain}/?s=${encodeURIComponent(keyword)}`;
            const res = await fetchv2(searchUrl);
            const html = await res.text();

            const $ = cheerio.load(html);
            const results = [];

            $(".anime-card").each((i, el) => {
                const link = $(el).find("a").attr("href");
                const title = $(el).find(".anime-title").text().trim();
                const poster = $(el).find("img").attr("src");

                if (link && title) {
                    results.push({
                        title: title,
                        url: link,
                        image: poster || ""
                    });
                }
            });

            if (results.length > 0) return results;

        } catch (e) {
            // جرب الدومين اللي بعده
        }
    }

    return []; // لو مفيش نتائج في أي دومين
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
