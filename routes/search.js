const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/search?q=term — search across bookmarks, services, stocks
router.get('/', (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ results: [] });
    }

    const pattern = `%${q}%`;
    const results = [];

    // Search bookmarks (name, url)
    const bookmarks = db.prepare(
      'SELECT id, name, url, icon FROM bookmarks WHERE name LIKE ? OR url LIKE ? ORDER BY sort_order ASC LIMIT 10'
    ).all(pattern, pattern);
    for (const b of bookmarks) {
      results.push({ type: 'bookmark', id: b.id, name: b.name, url: b.url, icon: b.icon });
    }

    // Search services (name)
    const services = db.prepare(
      'SELECT id, name, url, icon FROM services WHERE name LIKE ? ORDER BY sort_order ASC LIMIT 10'
    ).all(pattern);
    for (const s of services) {
      results.push({ type: 'service', id: s.id, name: s.name, url: s.url, icon: s.icon });
    }

    // Search stocks (symbol)
    const stocks = db.prepare(
      'SELECT id, symbol FROM stocks WHERE symbol LIKE ? ORDER BY sort_order ASC LIMIT 10'
    ).all(pattern);
    for (const st of stocks) {
      results.push({ type: 'stock', id: st.id, name: st.symbol, url: `https://finance.yahoo.com/quote/${encodeURIComponent(st.symbol)}` });
    }

    res.json({ results });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
