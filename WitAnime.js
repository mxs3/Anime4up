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
  const response = await fetch(url);
  const html = typeof response === 'string' ? response : await response.text();

  const episodes = [];

  // Witanime episodes use onclick base64
  const base64Matches = [...html.matchAll(/onclick="openEpisode\('([^']+)'\)"/g)];
  if (base64Matches.length > 0) {
    for (let i = 0; i < base64Matches.length; i++) {
      const decoded = atob(base64Matches[i][1]);
      episodes.push({
        title: `الحلقة ${i + 1}`,
        url: decoded
      });
    }
    return episodes.reverse(); // ترتيب تصاعدي
  }

  return episodes; // لو مفيش حاجة اتسحبت
}

  // Check for onclick-based base64 episodes (like Witanime)
  const base64Matches = [...html.matchAll(/onclick="openEpisode\('([^']+)'\)"/g)];
  if (base64Matches.length > 0) {
    for (let i = 0; i < base64Matches.length; i++) {
      const decoded = atob(base64Matches[i][1]);
      episodes.push({ title: `الحلقة ${i + 1}`, url: decoded });
    }
    return episodes.reverse();
  }

  // Check for direct episode links like: <a href="..." >الحلقة <em>1</em></a>
  const directEpMatches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*الحلقة\s*<em>(\d+)<\/em>\s*<\/a>/g)];
  if (directEpMatches.length > 0) {
    for (const match of directEpMatches) {
      episodes.push({ title: `الحلقة ${match[2]}`, url: match[1] });
    }
    return episodes;
  }

  // Fallback: Detect any generic episode link pattern (edit this per site if needed)
  const genericMatches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*link-btn[^"]*"/g)];
  for (let i = 0; i < genericMatches.length; i++) {
    episodes.push({ title: `الحلقة ${i + 1}`, url: genericMatches[i][1] });
  }

  return episodes;
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
