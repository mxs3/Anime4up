async function searchResults(keyword) {
    const domains = [
        "https://4i.nxdwle.shop",
        "https://anime4up.rest",
        "https://anime4up.bond"
    ];

    for (const domain of domains) {
        try {
            const url = `${domain}/?s=${encodeURIComponent(keyword)}`;
            const res = await fetchv2(url);
            const html = await res.text();

            // تأكد من وجود نتيجة HTML
            if (!html || html.trim() === "") continue;

            const doc = new DOMParser().parseFromString(html, "text/html");
            const cards = doc.querySelectorAll(".anime-card");
            const results = [];

            cards.forEach(card => {
                const link = card.querySelector("a")?.href;
                const title = card.querySelector(".anime-title")?.textContent?.trim();
                const image = card.querySelector("img")?.src;

                if (link && title) {
                    results.push({
                        title: title,
                        url: link,
                        image: image || ""
                    });
                }
            });

            if (results.length > 0) return results;

        } catch (e) {
            // تجاهل الخطأ وجرب الدومين التالي
            continue;
        }
    }

    return []; // إذا لم تنجح أي محاولة
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
