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
    const defaultResponse = {
        status: "error",
        message: "حدث خطأ غير متوقع",
        fallbackUrl: 'https://files.catbox.moe/avolvc.mp4'
    };

    try {
        // 1. جلب محتوى الصفحة
        const response = await fetchv2(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
                "Referer": "https://witanime.world/"
            }
        });
        
        const html = await response.text();

        // 2. استخراج معلومات السيرفرات
        const servers = extractServers(html);
        if (servers.length === 0) {
            return JSON.stringify({
                ...defaultResponse,
                message: "لا توجد سيرفرات متاحة"
            });
        }

        // 3. اختيار أفضل سيرفر
        const selectedServer = selectBestServer(servers);
        
        // 4. استخراج رابط التشغيل
        const streamUrl = extractStreamLink(html, selectedServer.id);
        if (!streamUrl) {
            return JSON.stringify({
                ...defaultResponse,
                message: "لا يوجد رابط تشغيل متاح"
            });
        }

        // 5. معالجة الرابط حسب نوعه
        const finalUrl = await processStreamUrl(streamUrl);

        return JSON.stringify({
            status: "success",
            server: selectedServer.name,
            url: finalUrl,
            type: getStreamType(finalUrl)
        });

    } catch (error) {
        console.error('حدث خطأ:', error);
        return JSON.stringify({
            ...defaultResponse,
            message: error.message || "حدث خطأ غير متوقع"
        });
    }
}

// ... باقي الدوال المساعدة تبقى كما هي ...

// ===== الدوال المساعدة ===== //

// استخراج السيرفرات من HTML
function extractServers(html) {
    const serverRegex = /<a[^>]*data-server-id="(\d+)"[^>]*>.*?<span class="ser">([^<]+)<\/span>/gis;
    const servers = [];
    let match;
    
    while ((match = serverRegex.exec(html)) !== null) {
        servers.push({
            id: match[1],
            name: match[2].trim().toLowerCase()
        });
    }
    
    return servers;
}

// اختيار أفضل سيرفر
function selectBestServer(servers) {
    const preferredOrder = ['streamwish', 'okru', 'vidstream', 'mp4upload', 'dood', 'voe'];
    
    for (const serverName of preferredOrder) {
        const found = servers.find(s => s.name.includes(serverName));
        if (found) return found;
    }
    
    return servers[0];
}

// استخراج رابط التشغيل
function extractStreamLink(html, serverId) {
    const regex = new RegExp(`loadIframe\\([^)]*data-server-id="${serverId}"[^)]*\\)[^}]*src:\\s*["']([^"']+)["']`, 'i');
    const match = html.match(regex);
    return match ? match[1] : null;
}

// تحديد نوع الرابط
function getStreamType(url) {
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('streamwish')) return 'streamwish';
    if (url.includes('dood')) return 'doodstream';
    return 'unknown';
}

// معالجة الروابط المختلفة
async function processStreamUrl(url) {
    const type = getStreamType(url);
    
    switch (type) {
        case 'hls':
            return await handleHlsStream(url);
        case 'mp4':
            return await handleMp4Stream(url);
        case 'streamwish':
            return await handleStreamwish(url);
        case 'doodstream':
            return await handleDoodstream(url);
        default:
            return url;
    }
}

// معالجة روابط HLS
async function handleHlsStream(url) {
    try {
        // يمكن إضافة تحويلات خاصة بصيغة HLS هنا
        return url;
    } catch (e) {
        console.error('خطأ في معالجة HLS:', e);
        return url;
    }
}

// معالجة روابط MP4
async function handleMp4Stream(url) {
    try {
        // يمكن إضافة تحويلات خاصة بصيغة MP4 هنا
        return url;
    } catch (e) {
        console.error('خطأ في معالجة MP4:', e);
        return url;
    }
}

// معالجة روابط Streamwish
async function handleStreamwish(url) {
    try {
        // إذا كان الرابط مشفرًا أو يحتاج لفك تشفير
        if (url.includes('encrypt')) {
            return await decodeStreamwishUrl(url);
        }
        return url;
    } catch (e) {
        console.error('خطأ في معالجة Streamwish:', e);
        return url;
    }
}

// معالجة روابط Doodstream
async function handleDoodstream(url) {
    try {
        // إذا كان الرابط يحتاج لاستخراج الرابط المباشر
        if (url.includes('dood.')) {
            const directUrl = await extractDoodstreamDirectUrl(url);
            return directUrl || url;
        }
        return url;
    } catch (e) {
        console.error('خطأ في معالجة Doodstream:', e);
        return url;
    }
}

// دالة فك تشفير Streamwish (مثال)
async function decodeStreamwishUrl(encodedUrl) {
    try {
        // هنا يمكنك تطبيق خوارزمية فك التشفير الخاصة بموقع streamwish
        // هذه مجرد مثال:
        const decoded = atob(encodedUrl.split('?token=')[1]);
        return decoded || encodedUrl;
    } catch (e) {
        console.error('خطأ في فك تشفير الرابط:', e);
        return encodedUrl;
    }
}

// استخراج الرابط المباشر من Doodstream (مثال)
async function extractDoodstreamDirectUrl(url) {
    try {
        // هنا يمكنك إضافة كود لاستخراج الرابط المباشر من صفحة doodstream
        const response = await fetchv2(url);
        const html = await response.text();
        const match = html.match(/https?:\/\/[^'"]+\.m3u8/);
        return match ? match[0] : null;
    } catch (e) {
        console.error('خطأ في استخراج رابط Doodstream:', e);
        return null;
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
