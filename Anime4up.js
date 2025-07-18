async function searchResults(keyword) {
  const domains = [
    "https://4i.nxdwle.shop",
    "https://anime4up.rest",
    "https://anime4up.bond"
  ];

  for (const domain of domains) {
    const listUrl = `${domain}/anime-list-3/`;
    const html = await fetchv2(listUrl);
    if (!html) continue;

    const regex = /<li>\s*<a href="([^"]+)">([^<]+)<\/a>\s*<\/li>/g;
    const results = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
      const link = match[1];
      const rawTitle = decodeHTMLEntities(match[2]);
      if (rawTitle.toLowerCase().includes(keyword.toLowerCase())) {
        results.push({
          title: rawTitle,
          href: link.startsWith("http") ? link : domain + link,
          image: `${domain}/wp-content/themes/anime/images/logo.png` // صورة افتراضية
        });
      }
    }

    if (results.length > 0) return results;
  }

  return []; // fallback
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
