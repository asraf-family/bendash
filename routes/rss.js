const express = require('express');
const router = express.Router();
const fetch = globalThis.fetch || require('node-fetch');
const { parseStringPromise } = require('xml2js');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 min

function parseHebitsTitle(title) {
  // Format: [ Category ] Hebrew Name Year [ Release.Name ] [ Source / Container / Codec / Resolution / Language / Subs ]
  const result = { hebrewName: '', parsedCategory: '', quality: '', source: '', language: '', releaseName: '', year: '' };

  try {
    // Extract all bracketed sections with their positions
    const brackets = [];
    const regex = /\[\s*([^\]]*?)\s*\]/g;
    let match;
    while ((match = regex.exec(title)) !== null) {
      brackets.push({ text: match[1].trim(), start: match.index, end: match.index + match[0].length });
    }

    if (brackets.length >= 1) {
      result.parsedCategory = brackets[0].text;
    }

    if (brackets.length >= 3) {
      result.releaseName = brackets[1].text;
      // Last bracket has tech details
      const techParts = brackets[brackets.length - 1].text.split('/').map(s => s.trim());
      for (const part of techParts) {
        if (!result.quality && /4K|2160p|1080p|720p|480p|HDR/i.test(part)) {
          result.quality = part;
        }
        if (!result.source && /blu-?ray|web-?dl|web-?rip|hdtv|dvd|cam|hdcam|webrip|remux/i.test(part)) {
          result.source = part;
        }
        if (/עברית|אנגלית|מדובב|תרגום|מובנה|בצד|ערבית|רוסית|צרפתית/i.test(part)) {
          result.language = result.language ? result.language + ' / ' + part : part;
        }
      }
    } else if (brackets.length === 2) {
      result.releaseName = brackets[1].text;
    }

    // Extract Hebrew name + year: text between first ] and second [
    if (brackets.length >= 2) {
      const raw = title.substring(brackets[0].end, brackets[1].start).trim();
      // Extract year (4 digits, typically 1900-2099)
      const yearMatch = raw.match(/\b((?:19|20)\d{2})\b/);
      if (yearMatch) {
        result.year = yearMatch[1];
        result.hebrewName = raw.replace(yearMatch[0], '').trim();
      } else {
        result.hebrewName = raw;
      }
    } else if (brackets.length === 1) {
      result.hebrewName = title.substring(brackets[0].end).trim();
    }
  } catch (e) {
    // If parsing fails, hebrewName stays empty and frontend falls back to raw title
  }

  return result;
}

router.get('/', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      return res.json(cache.data);
    }

    const rssUrl = process.env.HEBITS_RSS_URL;
    if (!rssUrl) {
      return res.status(500).json({ error: 'HEBITS_RSS_URL not configured' });
    }

    const resp = await fetch(rssUrl);
    const xml = await resp.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    const channel = parsed.rss?.channel;
    if (!channel) {
      return res.json([]);
    }

    const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];

    const result = items.map(item => {
      const raw = item.title || '';
      const parsed = parseHebitsTitle(raw);
      return {
        title: raw,
        link: item.link || '',
        description: (item.description || '').replace(/<[^>]*>/g, '').trim(),
        category: item.category || '',
        pubDate: item.pubDate || '',
        ...parsed,
      };
    });

    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('RSS fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch RSS feed' });
  }
});

module.exports = router;
