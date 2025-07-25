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
    const res = await fetchv2(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": url }
    });
    const html = typeof res === 'string' ? res : await res.text();
    const episodes = [];

    // 1. محاولة استخراج anime_id
    const idMatch = html.match(/anime_select_episode['"]\s*,\s*['"](\d+)['"]/)
                  || html.match(/anime_id\s*=\s*"(\d+)"/);
    const animeId = idMatch ? idMatch[1] : null;

    // 2. لو animeId موجود: نجيب من الـ API
    if (animeId) {
      const apiRes = await fetchv2("https://witanime.world/wp-admin/admin-ajax.php", {
        method: "POST",
        headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded", "Referer": url },
        body: `action=anime_select_episode&anime_id=${animeId}`
      });
      const apiHtml = await apiRes.text();
      const apiRegex = /<li[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>\s*الحلقة\s*(\d+)/gi;
      let m;
      while ((m = apiRegex.exec(apiHtml)) !== null) {
        episodes.push({ href: m[1].trim(), number: parseInt(m[2].trim(),10) });
      }
    }

    // 3. fallback قوي: البحث في HTML نفسه
    if (episodes.length === 0) {
      const rec = [...html.matchAll(/<ul[^>]+class=["'][^"']*(?:all-episodes-list|scroll-episodes-list)[^"']*["'][\s\S]*?<\/ul>/i)];
      if (rec.length) {
        const ul = rec[0][0];
        for (const g of ul.matchAll(/onclick=["']openEpisode\('([^']+)'\)["']/gi)) {
          let enc = g[1];
          try {
            const decoded = atob(enc);
            const numMatch = decoded.match(/الحلقة\s*(\d+)/i);
            const num = numMatch ? parseInt(numMatch[1],10) : (episodes.length+1);
            episodes.push({ href: decoded, number: num });
          } catch {}
        }
      }
      // أو استخراج عام في HTML:
      else {
        for (const g of html.matchAll(/<a\s+href="([^"]+)"[^>]*>\s*الحلقة\s*(\d+)/gi)) {
          episodes.push({ href: g[1].trim(), number: parseInt(g[2].trim(),10) });
        }
      }
    }

    // 4. ترتيب تصاعدي للرقم
    episodes.sort((a,b)=>a.number - b.number);

    // 5. إذا لا حلقات: fallback الحلقة 1 الرابط نفسه
    return episodes.length ? JSON.stringify(episodes) : JSON.stringify([{ href: url, number: 1 }]);
  } catch (err) {
    console.error("extractEpisodes error:", err);
    return JSON.stringify([{ href: url, number: 1 }]);
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
