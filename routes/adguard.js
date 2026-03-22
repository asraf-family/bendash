const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const ADGUARD_URL = process.env.ADGUARD_URL || 'http://192.168.0.68';
const ADGUARD_USER = process.env.ADGUARD_USER || '';
const ADGUARD_PASS = process.env.ADGUARD_PASS || '';

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// GET /api/adguard/stats
router.get('/stats', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) return res.json(cache.data);

    const headers = {};
    if (ADGUARD_USER && ADGUARD_PASS) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${ADGUARD_USER}:${ADGUARD_PASS}`).toString('base64');
    }

    const resp = await fetch(`${ADGUARD_URL}/control/stats`, { headers });
    const stats = await resp.json();

    const result = {
      totalQueries: stats.num_dns_queries || 0,
      blockedQueries: stats.num_blocked_filtering || 0,
      blockedPercent: stats.num_dns_queries ? ((stats.num_blocked_filtering / stats.num_dns_queries) * 100).toFixed(1) : 0,
      avgProcessingTime: stats.avg_processing_time ? (stats.avg_processing_time * 1000).toFixed(0) : 0,
      topBlockedDomains: (stats.top_blocked_domains || []).slice(0, 5)
    };

    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('AdGuard error:', err.message);
    res.json({ error: true, totalQueries: 0, blockedQueries: 0, blockedPercent: 0 });
  }
});

// POST /api/adguard/toggle - enable/disable protection
router.post('/toggle', async (req, res) => {
  try {
    const { enabled } = req.body; // true or false
    const headers = { 'Content-Type': 'application/json' };
    if (ADGUARD_USER && ADGUARD_PASS) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${ADGUARD_USER}:${ADGUARD_PASS}`).toString('base64');
    }

    await fetch(`${ADGUARD_URL}/control/dns_config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ protection_enabled: enabled })
    });

    cache = { data: null, ts: 0 }; // clear cache
    res.json({ ok: true, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/adguard/pause - pause protection for duration
router.post('/pause', async (req, res) => {
  try {
    const { duration } = req.body; // duration in ms
    const headers = { 'Content-Type': 'application/json' };
    if (ADGUARD_USER && ADGUARD_PASS) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${ADGUARD_USER}:${ADGUARD_PASS}`).toString('base64');
    }

    // Disable protection
    await fetch(`${ADGUARD_URL}/control/dns_config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ protection_enabled: false })
    });

    // Schedule re-enable
    const resumeAt = Date.now() + duration;
    setTimeout(async () => {
      try {
        await fetch(`${ADGUARD_URL}/control/dns_config`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ protection_enabled: true })
        });
        cache = { data: null, ts: 0 };
      } catch (e) { console.error('AdGuard resume error:', e.message); }
    }, duration);

    cache = { data: null, ts: 0 };
    res.json({ ok: true, paused: true, resumeAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/adguard/status - get protection status
router.get('/status', async (req, res) => {
  try {
    const headers = {};
    if (ADGUARD_USER && ADGUARD_PASS) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${ADGUARD_USER}:${ADGUARD_PASS}`).toString('base64');
    }
    const resp = await fetch(`${ADGUARD_URL}/control/dns_info`, { headers });
    const info = await resp.json();
    res.json({ protectionEnabled: info.protection_enabled });
  } catch (err) {
    res.json({ protectionEnabled: null, error: err.message });
  }
});

module.exports = router;
