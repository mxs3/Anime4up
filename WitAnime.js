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
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": url }
    });
    const html = typeof res === 'string' ? res : await res.text();

    const episodes = [];

    // 1. استخراج من onclick="openEpisode('BASE64')"
    for (const m of html.matchAll(/onclick="openEpisode\('([^']+)'\)"/gi)) {
      try {
        const decoded = atob(m[1]);
        if (decoded.includes('http')) {
          episodes.push({ title: '', url: decoded });
        }
      } catch {}
    }

    // 2. استخراج من قائمة <ul class="all-episodes-list"> الحالة الخاصة
    const ulMatch = html.match(/<ul[^>]+class="[^"]*all-episodes-list[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
    if (ulMatch) {
      const listHtml = ulMatch[1];
      for (const m of listHtml.matchAll(/onclick="openEpisode\('([^']+)'\)">\s*[^<]*الحلقة\s*(\d+)/gi)) {
        try {
          const decoded = atob(m[1]);
          const num = parseInt(m[2].replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
          if (!isNaN(num)) {
            episodes.push({ title: `الحلقة ${num}`, url: decoded });
          }
        } catch {}
      }
    }

    // 3. استخراج روابط مباشرة مثل <a href="...">الحلقة رقم</a>
    for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(?:[^<]*?)?الحلقة\s*([\d٠-٩]+)[^<]*<\/a>/gi)) {
      const href = m[1];
      const num = parseInt(m[2].replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      if (!isNaN(num)) {
        episodes.push({ title: `الحلقة ${num}`, url: href });
      }
    }

    // 4. تهذيب النتائج وتصفية التكرار
    const map = new Map();
    episodes.forEach(ep => {
      if (ep.url && !map.has(ep.url)) {
        map.set(ep.url, ep);
      }
    });
    const unique = Array.from(map.values());

    // 5. ترتيب تصاعدي حسب الرقم
    unique.sort((a, b) => {
      const na = parseInt(a.title.match(/\d+/)?.[0] || 0);
      const nb = parseInt(b.title.match(/\d+/)?.[0] || 0);
      return na - nb;
    });

    if (unique.length) return unique;
    // fallback حلقة واحدة لو فاضي
    return [{ title: 'الحلقة 1', url }];

  } catch (err) {
    console.error("extractEpisodes error:", err);
    return [{ title: 'الحلقة 1', url }];
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
