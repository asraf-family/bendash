const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const agent = new https.Agent({ rejectUnauthorized: false });

let cache = { data: null, ts: 0 };
const CACHE_TTL = 60 * 1000;

async function getWanIp() {
  try {
    const resp = await fetch('https://api.ipify.org?format=json', { timeout: 5000 });
    const data = await resp.json();
    return data.ip;
  } catch {
    return null;
  }
}

async function getDeviceCount() {
  try {
    // Login to UniFi
    const unifiUrl = process.env.UNIFI_URL || 'https://192.168.0.1';
    const unifiUser = process.env.UNIFI_USER;
    const unifiPass = process.env.UNIFI_PASS;
    if (!unifiUser || !unifiPass) return null;

    const loginResp = await fetch(`${unifiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: unifiUser, password: unifiPass }),
      agent,
    });
    if (!loginResp.ok) return null;

    const cookies = loginResp.headers.raw()['set-cookie'];
    const cookieStr = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

    const staResp = await fetch(`${unifiUrl}/proxy/network/api/s/default/stat/sta`, {
      headers: { Cookie: cookieStr },
      agent,
    });
    if (!staResp.ok) return null;
    const staData = await staResp.json();
    return Array.isArray(staData.data) ? staData.data.length : null;
  } catch {
    return null;
  }
}

async function checkInternet() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch('https://www.google.com', { signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

router.get('/status', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      return res.json(cache.data);
    }

    const [wanIp, deviceCount, internetOnline] = await Promise.all([
      getWanIp(),
      getDeviceCount(),
      checkInternet(),
    ]);

    const result = { wanIp, deviceCount, internetOnline, lastCheck: new Date().toISOString() };
    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Network error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
