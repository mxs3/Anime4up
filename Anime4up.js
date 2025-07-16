async function search(query) {
  const searchUrl = `https://4i.nxdwle.shop/?s=${encodeURIComponent(query)}`;
  try {
    const res = await fetchv2(searchUrl);
    const html = await res.text();
    return JSON.stringify(searchResults(html));
  } catch (err) {
    console.error("Search error:", err);
    return JSON.stringify([]);
  }
}

function searchResults(html) {
  const results = [];
  const itemBlocks = html.match(/<div class="anime-card-container">[\s\S]*?<\/a>/g);
  if (!itemBlocks) return results;

  itemBlocks.forEach(block => {
    const hrefMatch = block.match(/<a href="([^"]+)"/);
    const titleMatch = block.match(/<h3 class="anime-card-title">([^<]+)<\/h3>/);
    const imgMatch = block.match(/<img[^>]+data-src="([^"]+)"/);

    if (hrefMatch && titleMatch && imgMatch) {
      const href = hrefMatch[1];
      const title = titleMatch[1].trim();
      const image = imgMatch[1];

      results.push({ title, href, image });
    }
  });

  return results;
}

async function extractDetails(url) {
  const res = await fetchv2(url);
  const html = await res.text();

  const descriptionMatch = html.match(/<div class="anime-details-info.*?<p>(.*?)<\/p>/s);
  const description = descriptionMatch ? decodeHTMLEntities(descriptionMatch[1].trim()) : 'N/A';

  const aliasMatch = html.match(/اسم الأنمي بالإنجليزي\s*<\/span>\s*:\s*(.*?)<\/li>/);
  const aliases = aliasMatch ? decodeHTMLEntities(aliasMatch[1].trim()) : 'N/A';

  const airdateMatch = html.match(/تاريخ الإصدار\s*<\/span>\s*:\s*(.*?)<\/li>/);
  const airdate = airdateMatch ? decodeHTMLEntities(airdateMatch[1].trim()) : 'N/A';

  return JSON.stringify([{
    description,
    aliases,
    airdate,
  }]);
}

async function extractEpisodes(url) {
  const res = await fetchv2(url);
  const html = await res.text();
  const episodes = [];

  const matches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*class="ep-num">([^<]+)<\/a>/g)];

  matches.forEach(match => {
    const href = match[1];
    const number = parseInt(match[2].replace(/\D/g, ''), 10) || 0;
    episodes.push({ number, href });
  });

  return JSON.stringify(episodes);
}

async function extractStreamUrl(html) {
  const multiStreams = { streams: [], subtitles: null };

  try {
    const serverMatch = html.match(/data-video="([^"]+)"/);
    if (!serverMatch) return JSON.stringify(multiStreams);

    const iframeUrl = serverMatch[1];
    const response = await fetchv2(iframeUrl);
    const iframeHtml = await response.text();

    const qualities = extractQualities(iframeHtml);

    if (qualities.length > 0) {
      multiStreams.streams = qualities;
      return JSON.stringify(multiStreams);
    }
  } catch (err) {
    console.error("Stream extraction error:", err);
  }

  // fallback رابط احتياطي
  multiStreams.streams.push({ quality: "480p", url: "https://files.catbox.moe/avolvc.mp4" });
  return JSON.stringify(multiStreams);
}

function extractQualities(html) {
  const sources = [];
  const regex = /{file:"([^"]+)",label:"([^"]+)",type:"hls"}/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    sources.push({
      quality: match[2],
      url: match[1]
    });
  }
  return sources;
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
