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
    const soraFetch = async (url, options = {}) => {
        const res = await fetch(url, {
            ...options,
            headers: {
                'User-Agent': 'Sora/Stream',
                'X-Requested-With': 'XMLHttpRequest',
                ...options.headers,
            }
        });
        const text = await res.text();
        return text;
    };

    const getPostId = html => {
        const match = html.match(/"post_id":\s*(\d+)/);
        return match ? match[1] : null;
    };

    const decodeBase64 = str => {
        try {
            return atob(str);
        } catch {
            return null;
        }
    };

    const mainHtml = await soraFetch(url);
    const postId = getPostId(mainHtml);
    if (!postId) return [];

    const ajaxUrl = `https://witanime.world/wp-admin/admin-ajax.php?action=load_episodes&post=${postId}`;
    let episodesHtml;
    try {
        episodesHtml = await soraFetch(ajaxUrl);
    } catch (e) {
        return [];
    }

    if (!episodesHtml.includes("openEpisode")) return [];

    const episodes = [...episodesHtml.matchAll(/<a[^>]+onclick="openEpisode\('([^']+)'\)[^>]*>(?:\s*الحلقة)?\s*([^<\n]+)/g)]
        .map(([, base64, title]) => {
            const streamUrl = decodeBase64(base64);
            return streamUrl && title
                ? {
                    title: `الحلقة ${title.trim()}`,
                    url: streamUrl.trim()
                }
                : null;
        })
        .filter(Boolean)
        .reverse();

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
