const express = require('express');
const router = express.Router();
const fetch = globalThis.fetch || require('node-fetch');
const db = require('../db');
const { validateLength } = require('../lib/validate');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// Check if US stock market is currently open
// Mon-Fri, 9:30 AM - 4:00 PM Eastern Time
function isMarketOpen() {
  const now = new Date();
  // Convert to Eastern Time
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const isWeekday = day >= 1 && day <= 5;
  const isDuringHours = timeInMinutes >= 570 && timeInMinutes < 960; // 9:30=570, 16:00=960

  return { usMarketOpen: isWeekday && isDuringHours };
}

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

    // Extract closing prices and timestamps for sparkline
    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];
    const history = [];
    const historyDates = [];
    closes.forEach((v, i) => {
      if (v != null) {
        history.push(parseFloat(v.toFixed(2)));
        const ts = timestamps[i];
        historyDates.push(ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '');
      }
    });

    return {
      symbol: meta.symbol || symbol,
      name: meta.shortName || meta.symbol || symbol,
      price: price,
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      currency: meta.currency || 'USD',
      history,
      historyDates,
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

    // Process in batches of 3 to avoid Yahoo rate limiting
    const results = [];
    for (let i = 0; i < symbols.length; i += 3) {
      const batch = symbols.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(fetchQuote));
      results.push(...batchResults);
    }

    const response = { stocks: results, ...isMarketOpen() };
    cache = { data: response, key: cacheKey, ts: Date.now() };
    res.json(response);
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
    const trimmed = symbol.trim();
    if (!validateLength(trimmed, 1, 10)) {
      return res.status(400).json({ error: 'symbol must be between 1 and 10 characters' });
    }
    if (!/^[A-Za-z0-9^]+$/.test(trimmed)) {
      return res.status(400).json({ error: 'symbol must be alphanumeric (^ allowed)' });
    }

    const upper = trimmed.toUpperCase();
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
