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
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": url
      }
    });
    const html = typeof res === "string" ? res : await res.text();
    const episodes = [];

    // ✅ نبحث داخل البلوك الذي يحتوي على div مع class DivEpisodeContainer
    const blockRegex = /<div[^>]+class="DivEpisodeContainer"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
    const blocks = [...html.matchAll(blockRegex)];

    let index = 1;
    for (const b of blocks) {
      const blockHtml = b[0];

      // link onclick extract
      const onclickMatch = blockHtml.match(/onclick="openEpisode\('([^']+)'\)"/i);
      // title رقم الحلقة داخل الحلقة CM
      const titleMatch = blockHtml.match(/<h3>\s*<a[^>]*>\s*الحلقة\s*(\d+)/i);
      if (onclickMatch && titleMatch) {
        let encoded = onclickMatch[1];
        let number = parseInt(titleMatch[1], 10);
        try {
          let decoded = atob(encoded);
          episodes.push({
            href: decoded,
            number: number
          });
        } catch (_e) {
          // لو atob مش شغال أو مفكك، نرجع قيمة مشفرة جزئيا
          episodes.push({
            href: encoded,
            number: number
          });
        }
      }
      index++;
    }

    // fallback لو مالقيناش بأي طريقة: نبص داخل html كله على any onclick openEpisode
    if (episodes.length === 0) {
      const fallback = [...html.matchAll(/onclick="openEpisode\('([^']+)'\)"/gi)];
      for (let i = 0; i < fallback.length; i++) {
        const enc = fallback[i][1];
        const num = i + 1;
        let href;
        try { href = atob(enc); }
        catch { href = enc; }
        episodes.push({ href, number: num });
      }
    }

    // sort ascending
    episodes.sort((a, b) => a.number - b.number);

    return JSON.stringify(episodes.length > 0 ? episodes : [{ href: url, number: 1 }]);
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
