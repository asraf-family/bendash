const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

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

    const result = items.map(item => ({
      title: item.title || '',
      link: item.link || '',
      description: (item.description || '').replace(/<[^>]*>/g, '').trim(),
      category: item.category || '',
      pubDate: item.pubDate || '',
    }));

    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('RSS fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch RSS feed' });
  }
});

module.exports = router;
