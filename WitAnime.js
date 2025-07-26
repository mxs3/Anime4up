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

// ========== دالة استخراج السيرفرات من صفحة الحلقة ==========
async function extractStreamUrl(html) {
    if (!_0xCheck()) {
        return JSON.stringify({
            streams: [{
                title: "Fallback (Offline)",
                streamUrl: "https://files.catbox.moe/avolvc.mp4",
                headers: {},
                subtitles: null
            }],
            subtitles: null
        });
    }

    const multiStreams = { streams: [], subtitles: null };

    const serverMatches = [...html.matchAll(/<li[^>]*data-watch=["']([^"']+)["'][^>]*>/g)];
    if (!serverMatches || serverMatches.length === 0) {
        multiStreams.streams.push({
            title: "Fallback (No Servers)",
            streamUrl: "https://files.catbox.moe/avolvc.mp4",
            headers: {},
            subtitles: null
        });
        return JSON.stringify(multiStreams);
    }

    const priority = ['ok.ru', 'dailymotion', 'streamwish', 'videa', 'yonaplay', 'mp4upload', 'vidmoly'];

    const sortedMatches = serverMatches.sort((a, b) => {
        const aIndex = priority.findIndex(s => a[1].includes(s));
        const bIndex = priority.findIndex(s => b[1].includes(s));
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    for (const match of sortedMatches) {
        const embedUrl = decodeHTMLEntities(match[1].trim());
        let videoUrl = null;
        let headers = {
            "Referer": embedUrl,
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
        };

        let label = "❌ Unknown";

        try {
            if (embedUrl.includes("dailymotion")) {
                const stream = await extractDailymotion(embedUrl);
                if (stream?.url) {
                    videoUrl = stream.url;
                    label = `✅ Dailymotion (${stream.quality})`;
                } else {
                    label = `❌ Dailymotion (No Stream)`;
                }
            } else {
                const response = await soraFetch(embedUrl, { headers });
                const embedHtml = await response.text();

                const streamMatch = embedHtml.match(/file\s*:\s*["']([^"']+\.m3u8)["']/i)
                    || embedHtml.match(/source\s+src=["']([^"']+\.mp4)["']/i)
                    || embedHtml.match(/src\s*:\s*["']([^"']+\.mp4)["']/i)
                    || embedHtml.match(/['"]?file['"]?\s*[:=]\s*["']([^"']+)["']/i);

                if (streamMatch) {
                    videoUrl = streamMatch[1].trim();
                }

                const baseName = priority.find(key => embedUrl.includes(key)) || "Unknown";
                label = videoUrl ? `✅ ${baseName}` : `❌ ${baseName} (No Stream)`;
            }
        } catch (err) {
            console.error("Error extracting stream:", err);
        }

        multiStreams.streams.push({
            title: label,
            streamUrl: videoUrl ?? null,
            headers,
            subtitles: null
        });
    }

    return JSON.stringify(multiStreams);
}

// دالة استخراج فيديو دالي موشن
async function extractDailymotion(iframeUrl) {
    const videoId = iframeUrl.match(/video=([a-zA-Z0-9]+)/)?.[1];
    if (!videoId) return null;

    const apiUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
    const res = await soraFetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.dailymotion.com/'
        }
    });

    const json = await res.json();
    if (!json?.qualities) return null;

    const streams = Object.entries(json.qualities).flatMap(([quality, sources]) =>
        sources.map(source => ({
            url: source.url,
            quality,
            type: source.type
        }))
    );

    const sorted = streams.sort((a, b) => {
        if (a.type.includes("mpegURL")) return -1;
        if (b.type.includes("mpegURL")) return 1;
        return parseInt(b.quality) - parseInt(a.quality);
    });

    const selected = sorted[0];
    return {
        url: selected.url,
        type: selected.type.includes("mpegURL") ? "hls" : "mp4",
        quality: selected.quality
    };
}

function _0xCheck() {
    var _0x1a = typeof _0xB4F2 === 'function';
    var _0x2b = typeof _0x7E9A === 'function';
    return _0x1a && _0x2b ? (function (_0x3c) {
        return _0x7E9A(_0x3c);
    })(_0xB4F2()) : !1;
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
  try {
    return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET');
  } catch (err) {
    return { text: async () => '', json: async () => ({}) };
  }
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
