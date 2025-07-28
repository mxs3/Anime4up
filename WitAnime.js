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

async function extractStreamUrl(url) {
    try {
        // 1. جلب المحتوى باستخدام fetchv2
        const response = await fetchv2(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
                "Referer": "https://witanime.world/"
            },
            timeout: 10000
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const html = await response.text();

        // 2. استخراج معلومات السيرفرات من الكود اللي انتا بعتو
        const serverList = [];
        // ريجيكس متكامل يمسك كل حاجة في الديف بتاع السيرفرات
        const serverRegex = /<a[^>]*?data-server-id="(\d+)"[^>]*?>\s*<span class="ser">\s*(streamwish|okru|vidstream|mp4upload|filemoon|dood|voe|google drive|mega|mediafire)\s*<\/span>/gi;
        
        let serverMatch;
        while ((serverMatch = serverRegex.exec(html)) !== null) {
            serverList.push({
                id: serverMatch[1],
                name: serverMatch[2].trim().toLowerCase()
            });
        }

        if (serverList.length === 0) {
            throw new Error("مفيش سيرفرات متاحة دلوقتي");
        }

        // 3. استخراج روابط التشغيل من السكريبت
        const scriptRegex = /<script[^>]*>[\s\S]*?loadIframe\([^)]*data-server-id="(\d+)"[^)]*\)[^}]*src:\s*["']([^"']+)["'][\s\S]*?<\/script>/gi;
        const sources = {};
        
        let scriptMatch;
        while ((scriptMatch = scriptRegex.exec(html)) !== null) {
            sources[scriptMatch[1]] = scriptMatch[2];
        }

        // 4. اختيار أفضل سيرفر (الأولوية لـ streamwish)
        const preferredOrder = ['streamwish', 'okru', 'vidstream', 'mp4upload', 'filemoon', 'dood', 'voe'];
        let selectedServer = null;

        for (const serverName of preferredOrder) {
            selectedServer = serverList.find(s => s.name.includes(serverName));
            if (selectedServer && sources[selectedServer.id]) break;
        }

        if (!selectedServer) {
            selectedServer = serverList[0];
        }

        if (!sources[selectedServer.id]) {
            throw new Error("معرفتش اجيب الرابط من السيرفر المختار");
        }

        const streamUrl = sources[selectedServer.id];

        // 5. استخراج روابط التحميل لو محتاجها
        const downloadLinks = {};
        const downloadRegex = /<a class="btn btn-default download-link"[^>]*data-index="(\d+)"[^>]*>\s*<span class="notice">([^<]+)<\/span>/gi;
        
        let downloadMatch;
        while ((downloadMatch = downloadRegex.exec(html)) !== null) {
            downloadLinks[downloadMatch[2].trim().toLowerCase()] = downloadMatch[0].match(/href="([^"]+)"/i)?.[1] || '#';
        }

        // 6. إرجاع النتيجة كاملة
        return JSON.stringify({
            status: "success",
            selected_server: {
                id: selectedServer.id,
                name: selectedServer.name,
                url: streamUrl
            },
            all_servers: serverList,
            download_links: downloadLinks,
            episode_info: {
                previous: html.match(/<a[^>]*rel="prev"[^>]*href="([^"]+)"/i)?.[1],
                next: html.match(/<a[^>]*rel="next"[^>]*href="([^"]+)"/i)?.[1],
                anime_page: html.match(/<a href="([^"]*\/anime\/[^"]+)"/i)?.[1]
            }
        }, null, 2);

    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.message,
            fallbackUrl: 'https://files.catbox.moe/avolvc.mp4'
        }, null, 2);
    }
}

// دالة مساعدة لتحويل الروابط المشفرة (base64)
function decodeBase64Url(encodedUrl) {
    try {
        return atob(encodedUrl);
    } catch (e) {
        console.error('فشل في فك تشفير الرابط:', e);
        return null;
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

// ✅ دالة التحقق
function _0xCheck() {
  var _0x1a = typeof _0xB4F2 === 'function';
  var _0x2b = typeof _0x7E9A === 'function';
  return _0x1a && _0x2b ? (function (_0x3c) {
    return _0x7E9A(_0x3c);
  })(_0xB4F2()) : !1;
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
