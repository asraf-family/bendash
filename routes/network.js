const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const agent = new https.Agent({ rejectUnauthorized: false });

let cache = { data: null, ts: 0 };
const CACHE_TTL = 60 * 1000;

let throughputCache = { data: null, ts: 0 };
const THROUGHPUT_CACHE_TTL = 10 * 1000;
let throughputHistory = [];
const MAX_HISTORY = 60;
let prevBytes = null;
let prevBytesTs = null;

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

async function getThroughput() {
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

  const healthResp = await fetch(`${unifiUrl}/proxy/network/api/s/default/stat/health`, {
    headers: { Cookie: cookieStr },
    agent,
  });
  if (!healthResp.ok) return null;
  const healthData = await healthResp.json();

  const wan = Array.isArray(healthData.data)
    ? healthData.data.find(s => s.subsystem === 'wan')
    : null;
  if (!wan) return null;

  const nowTs = Date.now();
  const rxBytes = wan['rx_bytes-r'] || 0; // bytes per second from UniFi
  const txBytes = wan['tx_bytes-r'] || 0;

  // UniFi's *-r fields are already rates (bytes/sec), convert to Mbps
  const downloadMbps = parseFloat(((rxBytes * 8) / 1e6).toFixed(2));
  const uploadMbps = parseFloat(((txBytes * 8) / 1e6).toFixed(2));

  // If UniFi doesn't provide rate fields, fall back to delta calculation
  let dlMbps = downloadMbps;
  let ulMbps = uploadMbps;
  if (rxBytes === 0 && txBytes === 0 && wan.rx_bytes && wan.tx_bytes) {
    if (prevBytes && prevBytesTs) {
      const dtSec = (nowTs - prevBytesTs) / 1000;
      if (dtSec > 0) {
        dlMbps = parseFloat((((wan.rx_bytes - prevBytes.rx) * 8) / dtSec / 1e6).toFixed(2));
        ulMbps = parseFloat((((wan.tx_bytes - prevBytes.tx) * 8) / dtSec / 1e6).toFixed(2));
        if (dlMbps < 0) dlMbps = 0;
        if (ulMbps < 0) ulMbps = 0;
      }
    }
    prevBytes = { rx: wan.rx_bytes, tx: wan.tx_bytes };
    prevBytesTs = nowTs;
  }

  return {
    downloadMbps: dlMbps,
    uploadMbps: ulMbps,
    wanIp: wan.wan_ip || wan.gateways?.[0] || null,
    ispName: wan.isp_name || wan.isp_organization || null,
  };
}

router.get('/throughput', async (req, res) => {
  try {
    if (throughputCache.data && Date.now() - throughputCache.ts < THROUGHPUT_CACHE_TTL) {
      return res.json({ ...throughputCache.data, history: throughputHistory });
    }

    const data = await getThroughput();
    if (!data) {
      return res.json({ downloadMbps: 0, uploadMbps: 0, wanIp: null, ispName: null, history: throughputHistory, error: 'Unable to fetch throughput' });
    }

    throughputHistory.push({ dl: data.downloadMbps, ul: data.uploadMbps, ts: Date.now() });
    if (throughputHistory.length > MAX_HISTORY) throughputHistory.shift();

    throughputCache = { data, ts: Date.now() };
    res.json({ ...data, history: throughputHistory });
  } catch (err) {
    console.error('Throughput error:', err.message);
    res.status(500).json({ error: err.message, history: throughputHistory });
  }
});

// GET /api/network/clients - list connected clients from UniFi
router.get('/clients', async (req, res) => {
  try {
    const unifiUrl = process.env.UNIFI_URL || 'https://192.168.0.1';
    const unifiUser = process.env.UNIFI_USER;
    const unifiPass = process.env.UNIFI_PASS;
    if (!unifiUser || !unifiPass) return res.json({ clients: [], error: 'No UniFi credentials' });

    const loginResp = await fetch(`${unifiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: unifiUser, password: unifiPass }),
      agent,
    });
    if (!loginResp.ok) return res.json({ clients: [], error: 'UniFi login failed' });

    const cookies = loginResp.headers.raw()['set-cookie'];
    const cookieStr = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

    // Fetch clients and health data in parallel
    const [staResp, healthResp] = await Promise.all([
      fetch(`${unifiUrl}/proxy/network/api/s/default/stat/sta`, {
        headers: { Cookie: cookieStr },
        agent,
      }),
      fetch(`${unifiUrl}/proxy/network/api/s/default/stat/health`, {
        headers: { Cookie: cookieStr },
        agent,
      }),
    ]);

    let latency = null;
    if (healthResp.ok) {
      const healthData = await healthResp.json();
      const wan = Array.isArray(healthData.data)
        ? healthData.data.find(s => s.subsystem === 'wan')
        : null;
      if (wan) {
        latency = wan.latency || wan.internet_latency || wan.uptime_stats?.latency || null;
      }
    }

    if (!staResp.ok) return res.json({ clients: [], latency, error: 'Failed to fetch clients' });
    const staData = await staResp.json();

    const clients = Array.isArray(staData.data) ? staData.data.map(c => ({
      name: c.name || c.hostname || c.oui || 'Unknown',
      ip: c.ip || null,
      mac: c.mac || null,
      rxBytes: c.rx_bytes || 0,
      txBytes: c.tx_bytes || 0,
      signal: c.signal != null ? c.signal : null,
      type: c.is_wired ? 'wired' : 'wifi',
      uptime: c.uptime || null,
    })) : [];

    res.json({ clients, latency });
  } catch (err) {
    console.error('Network clients error:', err.message);
    res.json({ clients: [], error: err.message });
  }
});

module.exports = router;
