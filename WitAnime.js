async function searchResults(keyword) {
  try {
    const url = `https://witanime.world/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://witanime.world/'
      }
    });
    const html = await res.text();

    const results = [];
    const blocks = html.split('anime-card-container');
    for (const block of blocks) {
      const hrefMatch = block.match(/<a[^>]+href="([^"]+\/anime\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/);
      const titleMatch = block.match(/anime-card-title[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/i);

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

async function extractDetails(url) {
  try {
    const response = await fetchv2(url);
    const html = await response.text();

    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // ✅ الوصف من <p class="anime-story">
    const descMatch = html.match(/<p class="anime-story">\s*([\s\S]*?)\s*<\/p>/i);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    // ✅ التصنيفات من <ul class="anime-genres">...</ul>
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

    // ✅ سنة العرض من <span>بداية العرض:</span> 2025
    const airdateMatch = html.match(/<span>\s*بداية العرض:\s*<\/span>\s*(\d{4})/i);
    if (airdateMatch) {
      const extracted = airdateMatch[1].trim();
      if (/^\d{4}$/.test(extracted)) {
        airdate = extracted;
      }
    }

    return JSON.stringify([
      {
        description,
        aliases,
        airdate: `سنة العرض: ${airdate}`
      }
    ]);
  } catch (error) {
    return JSON.stringify([
      {
        description: "تعذر تحميل الوصف.",
        aliases: "غير مصنف",
        airdate: "سنة العرض: غير معروفة"
      }
    ]);
  }
}

async function extractEpisodes(url) {
  const results = [];
  try {
    const res = await fetchv2(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": url
      }
    });
    const html = typeof res === "string" ? res : await res.text();

    // 1) نشوف لو الصفحة فيها قائمة episodes داخل div row
    const rowMatch = html.match(/<div[^>]+id=["']DivEpisodesList["'][\s\S]*?<\/div>/i);
    const block = rowMatch ? rowMatch[0] : html;

    // 2) نبحث على openEpisode encoded
    const regex1 = /openEpisode\(\s*'([^']+)'\s*\).*?>\s*الحلقة\s*(\d+)/gi;
    let m;
    while ((m = regex1.exec(block)) !== null) {
      try {
        const decoded = atob(m[1]);
        const num = parseInt(m[2], 10);
        if (!isNaN(num)) {
          results.push({ number: num, href: decoded });
        }
      } catch(e){}
    }

    // 3) fallback: روابط <a href="...">الحلقة N</a>
    if (results.length === 0) {
      const regex2 = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*الحلقة\s*(\d+)\s*<\/a>/gi;
      while ((m = regex2.exec(html)) !== null) {
        const num = parseInt(m[2], 10);
        if (!isNaN(num)) {
          results.push({ number: num, href: m[1].trim() });
        }
      }
    }

    // 4) نسوي ترتيب تصاعدي حسب الرقم
    results.sort((a,b)=>a.number-b.number);

    // 5) لو ما طلعش شيء نرجع الحلقة 1 الرابط الاساسي
    if (results.length === 0) {
      return JSON.stringify([{ number: 1, href: url }]);
    }
    return JSON.stringify(results);
  } catch(err) {
    console.error("extractEpisodes error:", err);
    return JSON.stringify([{ number: 1, href: url }]);
  }
}

function decodeHTMLEntities(text) {
  try {
    return text
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
      .replace(/&#x([\da-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  } catch {
    return text;
  }
}
