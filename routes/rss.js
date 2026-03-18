const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function parseHebitsTitle(title) {
  // Format: [ Category ] Hebrew Name [ Release.Name ] [ Source / Container / Codec / Resolution / Language / Subs ]
  const result = { hebrewName: '', parsedCategory: '', quality: '', source: '', language: '', releaseName: '' };

  try {
    // Extract all bracketed sections
    const brackets = [];
    const regex = /\[\s*([^\]]*?)\s*\]/g;
    let match;
    while ((match = regex.exec(title)) !== null) {
      brackets.push(match[1].trim());
    }

    if (brackets.length >= 1) {
      result.parsedCategory = brackets[0]; // e.g. "Movies", "Books", "Games"
    }

    if (brackets.length >= 3) {
      result.releaseName = brackets[1]; // e.g. "Marty.Supreme.2025.Hybrid.1080p.BluRay..."
      // Last bracket has tech details: "Source / Container / Codec / Resolution / Language / Subs"
      const techParts = brackets[brackets.length - 1].split('/').map(s => s.trim());
      // Look for resolution (quality)
      for (const part of techParts) {
        if (/4K|2160p|1080p|720p|480p|HDR/i.test(part)) {
          result.quality = part;
          break;
        }
      }
      // Look for source
      for (const part of techParts) {
        if (/blu-?ray|web-?dl|web-?rip|hdtv|dvd|cam|hdcam|webrip/i.test(part)) {
          result.source = part;
          break;
        }
      }
      // Language is typically the last 1-2 parts
      const langParts = techParts.filter(p =>
        /עברית|אנגלית|מדובב|תרגום|מובנה|בצד|ערבית|רוסית|צרפתית/i.test(p)
      );
      if (langParts.length > 0) {
        result.language = langParts.join(' / ');
      }
    } else if (brackets.length === 2) {
      result.releaseName = brackets[1];
    }

    // Extract Hebrew name: text between first ] and second [
    const afterFirstBracket = title.indexOf(']');
    const secondBracketOpen = title.indexOf('[', afterFirstBracket + 1);
    if (afterFirstBracket !== -1 && secondBracketOpen !== -1) {
      result.hebrewName = title.substring(afterFirstBracket + 1, secondBracketOpen).trim();
    } else if (afterFirstBracket !== -1) {
      result.hebrewName = title.substring(afterFirstBracket + 1).trim();
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
