async function searchResults(keyword) {
  const domain = "https://4i.nxdwle.shop"; // أو rest أو bond
  const url = `${domain}/wp-admin/admin-ajax.php`;
  const body = `action=ts_ac_do_search&ts_ac_query=${encodeURIComponent(keyword)}`;

  const res = await fetchv2(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body
  });

  const html = res || '';
  const $ = cheerio.load(html);
  const results = [];

  $('li a').each((i, el) => {
    const title = decodeHTMLEntities($(el).text().trim());
    const href = $(el).attr('href');
    if (href && title) {
      results.push({
        title,
        href: href.startsWith("http") ? href : domain + href,
        image: `${domain}/wp-content/themes/anime/images/logo.png`
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
