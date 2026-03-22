const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const CP_URL = process.env.CONTROL_PANEL_URL || 'http://127.0.0.1:3500';
const CP_PASS = process.env.CONTROL_PANEL_PASS || '';

let sessionCookie = null;

async function authenticate() {
  const resp = await fetch(`${CP_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `password=${encodeURIComponent(CP_PASS)}`,
    redirect: 'manual',
  });
  const setCookie = resp.headers.raw()['set-cookie'];
  if (setCookie) {
    for (const c of setCookie) {
      const match = c.match(/session=([^;]+)/);
      if (match) {
        sessionCookie = match[1];
        return;
      }
    }
  }
  throw new Error('Failed to authenticate with Control Panel');
}

async function cpFetch(path, options = {}) {
  if (!sessionCookie) await authenticate();

  let resp = await fetch(`${CP_URL}${path}`, {
    ...options,
    headers: { ...options.headers, Cookie: `session=${sessionCookie}` },
  });

  if (resp.status === 401) {
    await authenticate();
    resp = await fetch(`${CP_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Cookie: `session=${sessionCookie}` },
    });
  }

  return resp;
}

// GET /api/alfred-apps/status
router.get('/status', async (req, res) => {
  try {
    const resp = await cpFetch('/api/status');
    if (!resp.ok) throw new Error(`Control Panel returned ${resp.status}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('Alfred Apps status error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/alfred-apps/:id/start
router.post('/:id/start', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid id: must be numeric' });
  }
  try {
    const resp = await cpFetch(`/api/start/${req.params.id}`, { method: 'POST' });
    if (!resp.ok) throw new Error(`Control Panel returned ${resp.status}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('Alfred Apps start error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/alfred-apps/:id/stop
router.post('/:id/stop', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid id: must be numeric' });
  }
  try {
    const resp = await cpFetch(`/api/stop/${req.params.id}`, { method: 'POST' });
    if (!resp.ok) throw new Error(`Control Panel returned ${resp.status}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('Alfred Apps stop error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
