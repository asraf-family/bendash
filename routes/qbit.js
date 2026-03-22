const express = require('express');
const fetch = globalThis.fetch || require('node-fetch');
const router = express.Router();

const db = require('../db');

const { QBIT_URL, QBIT_USER, QBIT_PASS } = process.env;

// Track completed torrent hashes to avoid duplicate alerts
const completedHashes = new Set();

let sid = null;
let loginPromise = null;

async function ensureLogin() {
  if (loginPromise) return loginPromise;
  loginPromise = login().finally(() => { loginPromise = null; });
  return loginPromise;
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec >= 1048576) return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
  if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return bytesPerSec + ' B/s';
}

function formatBytes(bytes) {
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(2) + ' TB';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

async function login() {
  const resp = await fetch(`${QBIT_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(QBIT_USER)}&password=${encodeURIComponent(QBIT_PASS)}`,
  });
  const cookie = resp.headers.get('set-cookie');
  if (cookie) {
    const match = cookie.match(/SID=([^;]+)/);
    if (match) sid = match[1];
  }
  if (!sid) throw new Error('qBittorrent login failed');
}

async function qbitFetch(path) {
  const resp = await fetch(`${QBIT_URL}${path}`, {
    headers: { Cookie: `SID=${sid}` },
  });
  if (resp.status === 403) {
    // Session expired, re-login
    await ensureLogin();
    const retry = await fetch(`${QBIT_URL}${path}`, {
      headers: { Cookie: `SID=${sid}` },
    });
    return retry.json();
  }
  return resp.json();
}

async function qbitPost(path, body) {
  const opts = {
    method: 'POST',
    headers: {
      Cookie: `SID=${sid}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  };
  const resp = await fetch(`${QBIT_URL}${path}`, opts);
  if (resp.status === 403) {
    await ensureLogin();
    opts.headers.Cookie = `SID=${sid}`;
    return fetch(`${QBIT_URL}${path}`, opts);
  }
  return resp;
}

router.get('/summary', async (req, res) => {
  try {
    if (!sid) await login();

    const [transfer, torrents] = await Promise.all([
      qbitFetch('/api/v2/transfer/info'),
      qbitFetch('/api/v2/torrents/info'),
    ]);

    const downloading = torrents.filter(t => t.state === 'downloading' || t.state === 'stalledDL' || t.state === 'forcedDL').length;
    const seeding = torrents.filter(t => t.state === 'uploading' || t.state === 'stalledUP' || t.state === 'forcedUP').length;
    const paused = torrents.filter(t => t.state === 'pausedDL' || t.state === 'pausedUP').length;

    // Detect newly completed torrents (uploading + progress === 1)
    for (const t of torrents) {
      if (t.state === 'uploading' && t.progress === 1 && !completedHashes.has(t.hash)) {
        completedHashes.add(t.hash);
        try {
          db.prepare('INSERT INTO alerts (type, source, message) VALUES (?, ?, ?)')
            .run('info', 'qBittorrent', `Download complete: ${t.name}`);
        } catch (err) { console.error('qBit alert insert error:', err.message); }
      }
    }

    const totalUp = transfer.up_info_data || 0;
    const totalDl = transfer.dl_info_data || 0;
    const ratio = totalDl > 0 ? (totalUp / totalDl).toFixed(2) : '0.00';

    res.json({
      downloadSpeed: formatSpeed(transfer.dl_info_speed || 0),
      uploadSpeed: formatSpeed(transfer.up_info_speed || 0),
      downloading,
      seeding,
      paused,
      totalDownloaded: formatBytes(totalDl),
      totalUploaded: formatBytes(totalUp),
      ratio,
      connected: true,
    });
  } catch (err) {
    console.error('qBit error:', err.message);
    res.json({ connected: false, error: err.message });
  }
});

router.get('/torrents', async (req, res) => {
  try {
    if (!sid) await login();
    const torrents = await qbitFetch('/api/v2/torrents/info');
    const list = torrents.map(t => ({
      hash: t.hash,
      name: t.name,
      size: formatBytes(t.size || 0),
      progress: Math.round((t.progress || 0) * 100),
      dlspeed: formatSpeed(t.dlspeed || 0),
      upspeed: formatSpeed(t.upspeed || 0),
      ratio: (t.ratio || 0).toFixed(2),
      eta: t.eta,
      state: t.state,
      added_on: t.added_on,
    }));
    res.json({ torrents: list });
  } catch (err) {
    console.error('qBit torrents error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/torrents/:hash/pause', async (req, res) => {
  try {
    if (!sid) await login();
    await qbitPost('/api/v2/torrents/pause', `hashes=${req.params.hash}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('qBit pause error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/torrents/:hash/resume', async (req, res) => {
  try {
    if (!sid) await login();
    await qbitPost('/api/v2/torrents/resume', `hashes=${req.params.hash}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('qBit resume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
