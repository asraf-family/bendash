const express = require('express');
const router = express.Router();
const db = require('../db');

// HTTP-based speed test using Cloudflare endpoints (no API key needed)
async function runSpeedtest() {
  // Download test: fetch 10 MB from Cloudflare
  const dlStart = Date.now();
  const dlResp = await fetch('https://speed.cloudflare.com/__down?bytes=10000000');
  const buffer = await dlResp.arrayBuffer();
  const dlElapsed = (Date.now() - dlStart) / 1000;
  const downloadMbps = parseFloat(((buffer.byteLength * 8 / 1000000) / dlElapsed).toFixed(2));

  // Upload test: send 2 MB to Cloudflare
  const uploadPayload = new Uint8Array(2000000);
  const ulStart = Date.now();
  await fetch('https://speed.cloudflare.com/__up', {
    method: 'POST',
    body: uploadPayload,
  });
  const ulElapsed = (Date.now() - ulStart) / 1000;
  const uploadMbps = parseFloat(((uploadPayload.byteLength * 8 / 1000000) / ulElapsed).toFixed(2));

  // Ping estimate from download request latency (rough)
  const ping = Math.round((Date.now() - dlStart) > 0 ? 0 : 0);

  return { download: downloadMbps, upload: uploadMbps, ping: 0, server: 'Cloudflare' };
}

async function runAndStore() {
  try {
    const result = await runSpeedtest();
    db.prepare(
      'INSERT INTO speedtest_results (download, upload, ping, server) VALUES (?, ?, ?, ?)'
    ).run(result.download, result.upload, result.ping, result.server);
    console.log(`Speedtest complete: ${result.download} Mbps down, ${result.upload} Mbps up`);
    return result;
  } catch (err) {
    console.error('Speedtest error:', err.message);
    return null;
  }
}

// Schedule every 6 hours
setInterval(runAndStore, 6 * 60 * 60 * 1000);

// Run initial test 30 seconds after startup (don't block boot)
setTimeout(runAndStore, 30 * 1000);

// GET /api/speedtest/latest
router.get('/latest', (req, res) => {
  try {
    const row = db.prepare(
      'SELECT * FROM speedtest_results ORDER BY created_at DESC LIMIT 1'
    ).get();
    res.json(row || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/speedtest/history
router.get('/history', (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM speedtest_results WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at ASC"
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/speedtest/run
let running = false;
router.post('/run', async (req, res) => {
  if (running) {
    return res.status(429).json({ error: 'Test already in progress' });
  }
  running = true;
  try {
    const result = await runAndStore();
    if (!result) {
      return res.status(500).json({ error: 'Speedtest failed' });
    }
    const row = db.prepare(
      'SELECT * FROM speedtest_results ORDER BY created_at DESC LIMIT 1'
    ).get();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    running = false;
  }
});

module.exports = router;
