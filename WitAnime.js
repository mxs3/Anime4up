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
        'User-Agent': 'Mozilla/5.0',
        'Referer': url
      }
    });
    const html = await res.text();

    const typeMatch = html.match(/<div class="anime-info"><span>النوع:<\/span>\s*([^<]+)<\/div>/i);
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : "";

    if (type.includes("movie") || type.includes("فيلم")) {
      return JSON.stringify([{ href: url, number: 1 }]);
    }

    const encoded = html.match(/var\s+encodedEpisodeData\s*=\s*['"]([^'"]+)['"]/);
    if (!encoded) return JSON.stringify([{ href: url, number: 1 }]);

    const decodedJson = atob(encoded[1]);
    const episodes = JSON.parse(decodedJson);

    for (const ep of episodes) {
      const number = parseInt(ep.number, 10);
      const href = ep.url.trim();
      if (!isNaN(number) && href) {
        results.push({ number, href });
      }
    }

    results.sort((a, b) => a.number - b.number);
    return JSON.stringify(results);
  } catch {
    return JSON.stringify([{ href: url, number: 1 }]);
  }
}

async function extractStreamUrl(html) {
    const fallback = 'https://files.catbox.moe/avolvc.mp4';

    try {
        // استخراج كل روابط streamwish
        const servers = [...html.matchAll(/data-id=["'](\d+)["'][^>]*data-src=["']([^"']+)["'][^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi)]
            .map(s => ({
                id: s[1],
                url: s[2].startsWith('http') ? s[2] : 'https:' + s[2],
                name: s[3].trim().toLowerCase()
            }))
            .filter(s => s.name.includes('streamwish'));

        if (!servers.length) {
            return JSON.stringify({
                status: 'error',
                message: 'لا يوجد سيرفر streamwish',
                url: fallback
            });
        }

        const results = [];

        for (const server of servers) {
            const res = await soraFetch(server.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                    'Referer': 'https://witanime.world/'
                }
            });

            const body = await res.text();
            const unpacked = unpack(body);

            const allMatches = [...unpacked.matchAll(/file\s*:\s*["']([^"']+)["']/gi)];

            for (const match of allMatches) {
                const streamUrl = match[1];
                results.push({
                    server: server.name,
                    url: streamUrl,
                    type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4'
                });
            }
        }

        if (!results.length) {
            return JSON.stringify({
                status: 'error',
                message: 'لم يتم استخراج أي جودة من streamwish',
                url: fallback
            });
        }

        return JSON.stringify({
            status: 'success',
            streams: results
        });

    } catch (err) {
        return JSON.stringify({
            status: 'error',
            message: err.message || 'حدث خطأ غير متوقع',
            url: fallback
        });
    }

    // ✅ استخراج HLS من أي صفحة
    async function extractHlsStream(url) {
        try {
            const res = await soraFetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
                }
            });

            const html = await res.text();
            const unpacked = unpack(html);

            const match = unpacked.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    // ✅ استخراج MP4 من أي صفحة
    async function extractMp4Stream(url) {
        try {
            const res = await soraFetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
                }
            });

            const html = await res.text();
            const unpacked = unpack(html);

            const match = unpacked.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    // ✅ دالة unpack لفك eval
    function unpack(str) {
        const pattern = /eval\(function\(p,a,c,k,e,(?:r|d)\)([\s\S]+?)\)\)/;
        const matches = str.match(pattern);
        if (!matches) return '';
        try {
            return eval(matches[0]);
        } catch {
            return '';
        }
    }

// ✅ دالة fetch مخصصة
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET');
  } catch (err) {
    return { text: async () => '', json: async () => ({}) };
  }
}

// ✅ فك ترميز HTML
function decodeHTMLEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
