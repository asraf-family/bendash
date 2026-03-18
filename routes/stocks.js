const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const db = require('../db');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchQuote(symbol) {
  try {
    // Fetch 1-month daily data (includes current price + history)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const data = await resp.json();

    const result = data.chart?.result?.[0];
    if (!result) return { symbol, error: 'No data' };

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const change = price - prevClose;
    const changePercent = prevClose ? ((change / prevClose) * 100) : 0;

    // Extract closing prices for sparkline
    const closes = result.indicators?.quote?.[0]?.close || [];
    const history = closes.filter(v => v != null).map(v => parseFloat(v.toFixed(2)));

    return {
      symbol: meta.symbol || symbol,
      name: meta.shortName || meta.symbol || symbol,
      price: price,
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      currency: meta.currency || 'USD',
      history,
    };
  } catch (err) {
    return { symbol, error: err.message };
  }
}

// GET stock data for watchlist
router.get('/', async (req, res) => {
  try {
    const stocks = db.prepare('SELECT symbol FROM stocks ORDER BY sort_order ASC').all();
    const symbols = stocks.map(s => s.symbol);

    if (symbols.length === 0) {
      return res.json([]);
    }

    // Check cache
    const cacheKey = symbols.join(',');
    if (cache.data && cache.key === cacheKey && Date.now() - cache.ts < CACHE_TTL) {
      return res.json(cache.data);
    }

    const results = await Promise.all(symbols.map(fetchQuote));

    cache = { data: results, key: cacheKey, ts: Date.now() };
    res.json(results);
  } catch (err) {
    console.error('Stocks error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// POST add stock to watchlist
router.post('/', (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }

    const upper = symbol.trim().toUpperCase();
    const existing = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(upper);
    if (existing) {
      return res.status(409).json({ error: 'Symbol already in watchlist' });
    }

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM stocks').get();
    const sortOrder = (maxOrder.m || 0) + 1;

    db.prepare('INSERT INTO stocks (symbol, sort_order) VALUES (?, ?)').run(upper, sortOrder);
    cache = { data: null, ts: 0 }; // Invalidate cache
    res.status(201).json({ symbol: upper });
  } catch (err) {
    console.error('Stocks POST error:', err.message);
    res.status(500).json({ error: 'Failed to add stock' });
  }
});

// DELETE stock from watchlist
router.delete('/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const result = db.prepare('DELETE FROM stocks WHERE symbol = ?').run(symbol.toUpperCase());
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    cache = { data: null, ts: 0 }; // Invalidate cache
    res.json({ success: true });
  } catch (err) {
    console.error('Stocks DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete stock' });
  }
});

module.exports = router;
