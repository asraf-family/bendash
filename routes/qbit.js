const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const { QBIT_URL, QBIT_USER, QBIT_PASS } = process.env;

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

    res.json({
      downloadSpeed: formatSpeed(transfer.dl_info_speed || 0),
      uploadSpeed: formatSpeed(transfer.up_info_speed || 0),
      downloading,
      seeding,
      paused,
      totalDownloaded: formatBytes(transfer.dl_info_data || 0),
      totalUploaded: formatBytes(transfer.up_info_data || 0),
      connected: true,
    });
  } catch (err) {
    console.error('qBit error:', err.message);
    res.json({ connected: false, error: err.message });
  }
});

module.exports = router;
