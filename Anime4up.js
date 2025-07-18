async function searchResults(keyword) {
    const multiDomains = [
        "https://4i.nxdwle.shop",
        "https://anime4up.rest",
        "https://anime4up.bond"
    ];

    for (const domain of multiDomains) {
        try {
            const searchUrl = domain.trim().replace(/\/+$/, '') + "/?s=" + encodeURIComponent(keyword);
            console.log("Trying URL:", searchUrl);  // ✅ دي مهمة

            const res = await fetchv2(searchUrl);
            const html = await res.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const results = [];
            const items = doc.querySelectorAll(".anime-card");

            items.forEach((el) => {
                const a = el.querySelector("a");
                const img = el.querySelector("img");
                const title = el.querySelector(".anime-title");

                if (a && title) {
                    results.push({
                        title: title.textContent.trim(),
                        url: a.href,
                        image: img?.src || ""
                    });
                }
            });

            if (results.length > 0) return results;

        } catch (e) {
            console.log("Error for domain:", domain, e.message);
        }
    }

    return [];
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
