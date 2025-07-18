// ✅ دالة فك ترميز الكيانات (HTML Entities) — نسخة واحدة فقط
function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#39;': "'"
  };
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}

// ✅ دالة البحث
async function searchResults(keyword) {
  try {
    const url = `https://4s.qerxam.shop/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
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

// ✅ دالة استخراج التفاصيل
async function extractDetails(url) {
  try {
    const response = await fetchv2(url); // No headers needed
    const html = await response.text();

    // Fallback values
    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // ✅ الوصف
    const descMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/i);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    // ✅ التصنيفات
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

    // ✅ تاريخ العرض
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
    console.error("extractDetails error:", error.message);
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
  const visited = new Set();

  try {
    // تابع لجلب الحلقات من صفحة واحدة
    const fetchPage = async (pageUrl) => {
      const res = await fetchv2(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": url
        }
      });

      const html = await res.text();

      // لو Movie، رجع حلقة واحدة فقط
      const typeMatch = html.match(/<div class="anime-info"><span>النوع:<\/span>\s*([^<]+)<\/div>/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : "";
      if (type.includes("movie") || type.includes("فيلم")) {
        return [{ href: url, number: 1 }];
      }

      // استخرج الحلقات
      const epRegex = /<div class="episodes-card-title">\s*<h3>\s*<a[^>]+href="([^"]+)"[^>]*>\s*الحلقة\s*(\d+)<\/a>/gi;
      let match;
      const localResults = [];
      while ((match = epRegex.exec(html)) !== null) {
        const href = match[1].trim();
        const number = parseInt(match[2].trim());
        if (!isNaN(number)) {
          localResults.push({ href, number });
        }
      }

      return localResults;
    };

    // ابدأ من الصفحة الأولى
    const firstPageRes = await fetchv2(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": url
      }
    });
    const firstHtml = await firstPageRes.text();

    // تحقق من النوع
    const typeMatch = firstHtml.match(/<div class="anime-info"><span>النوع:<\/span>\s*([^<]+)<\/div>/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : "";
    if (type.includes("movie") || type.includes("فيلم")) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    // جلب الصفحة الأولى
    const firstEpisodes = await fetchPage(url);
    firstEpisodes.forEach(ep => results.push(ep));

    // استخراج رقم آخر صفحة من pagination
    const maxPageMatch = [...firstHtml.matchAll(/<a[^>]+href="[^"]+\/page\/(\d+)\/"[^>]*>/gi)];
    const pages = maxPageMatch.map(m => parseInt(m[1])).filter(n => !isNaN(n));
    const maxPage = Math.max(1, ...pages);

    // باقي الصفحات
    for (let i = 2; i <= maxPage; i++) {
      const pageUrl = url.endsWith('/') ? `${url}page/${i}/` : `${url}/page/${i}/`;
      if (visited.has(pageUrl)) continue;
      visited.add(pageUrl);

      const episodes = await fetchPage(pageUrl);
      episodes.forEach(ep => results.push(ep));
    }

    // ترتيب طبيعي تصاعدي
    results.sort((a, b) => a.number - b.number);

    // fallback
    if (results.length === 0) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    return JSON.stringify(results);
  } catch (err) {
    console.error("extractEpisodes error:", err);
    return JSON.stringify([{ href: url, number: 1 }]);
  }
}
