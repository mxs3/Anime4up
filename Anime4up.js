async function searchResults(keyword) {
    const encoded = encodeURIComponent(keyword);
    const url = `https://4i.nxdwle.shop/?s=${encoded}`;

    const res = await fetchv2(url, {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)"
    });

    const html = await res.text();

    console.log("🧾 HTML Length:", html.length);
    console.log("📄 HTML Preview:", html.slice(0, 300));

    if (!html || html.length < 500) {
        console.log("❌ HTML is too short or empty");
        return [];
    }

    const results = [];

    const itemBlocks = [...html.matchAll(/<div class="anime-card-container">([\s\S]*?)<\/div>\s*<\/div>/g)];

    console.log("🧪 Matches found:", itemBlocks.length);

    for (const match of itemBlocks) {
        const block = match[1];

        const title = block.match(/anime-card-title[^>]*>\s*<h3>\s*<a[^>]*>([^<]+)<\/a>/)?.[1];
        const href = block.match(/<a[^>]+href="([^"]+)"[^>]*class="overlay"/)?.[1];
        const image = block.match(/<img[^>]+src="([^"]+)"/)?.[1];

        if (title && href && image) {
            results.push({
                title: title.trim(),
                href: href.trim(),
                image: image.trim()
            });
        }
    }

    if (results.length === 0) {
        console.log("⚠️ No search results extracted.");
        return [];
    }

    console.log("✅ Extracted search results:", results.length);
    return results;
}

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    
    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };
    
    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}

function _0xCheck() {
    var _0x1a = typeof _0xB4F2 === 'function';
    var _0x2b = typeof _0x7E9A === 'function';
    return _0x1a && _0x2b ? (function(_0x3c) {
        return _0x7E9A(_0x3c);
    })(_0xB4F2()) : !1;
}

function _0x7E9A(_){return((___,____,_____,______,_______,________,_________,__________,___________,____________)=>(____=typeof ___,_____=___&&___[String.fromCharCode(...[108,101,110,103,116,104])],______=[...String.fromCharCode(...[99,114,97,110,99,105])],_______=___?[...___[String.fromCharCode(...[116,111,76,111,119,101,114,67,97,115,101])]()]:[],(________=______[String.fromCharCode(...[115,108,105,99,101])]())&&_______[String.fromCharCode(...[102,111,114,69,97,99,104])]((_________,__________)=>(___________=________[String.fromCharCode(...[105,110,100,101,120,79,102])](_________))>=0&&________[String.fromCharCode(...[115,112,108,105,99,101])](___________,1)),____===String.fromCharCode(...[115,116,114,105,110,103])&&_____===16&&________[String.fromCharCode(...[108,101,110,103,116,104])]===0))(_)}
