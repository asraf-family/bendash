const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all bookmarks
router.get('/', (req, res) => {
  try {
    const bookmarks = db.prepare('SELECT * FROM bookmarks ORDER BY sort_order ASC').all();
    res.json(bookmarks);
  } catch (err) {
    console.error('Bookmarks GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

// POST new bookmark
router.post('/', (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }

    let iconUrl = null;
    try {
      iconUrl = `/api/bookmarks/favicon?url=${encodeURIComponent(url)}`;
    } catch (e) { /* ignore invalid URL */ }

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM bookmarks').get();
    const sortOrder = (maxOrder.m || 0) + 1;

    const result = db.prepare('INSERT INTO bookmarks (name, url, icon, sort_order) VALUES (?, ?, ?, ?)').run(name, url, iconUrl, sortOrder);

    const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(bookmark);
  } catch (err) {
    console.error('Bookmarks POST error:', err.message);
    res.status(500).json({ error: 'Failed to add bookmark' });
  }
});

// DELETE bookmark
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Bookmarks DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// PUT reorder bookmarks
router.put('/reorder', (req, res) => {
  try {
    const items = req.body; // [{id, sort_order}]
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Array of {id, sort_order} required' });
    }

    const update = db.prepare('UPDATE bookmarks SET sort_order = ? WHERE id = ?');
    const reorder = db.transaction((items) => {
      for (const item of items) {
        update.run(item.sort_order, item.id);
      }
    });
    reorder(items);
    res.json({ success: true });
  } catch (err) {
    console.error('Bookmarks reorder error:', err.message);
    res.status(500).json({ error: 'Failed to reorder bookmarks' });
  }
});

// SSRF protection: validate URL before making server-side requests
function isUrlSafe(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') return false;
    // Block private/internal IP ranges
    const parts = hostname.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p))) {
      if (parts[0] === 127) return false;
      if (parts[0] === 10) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      if (parts[0] === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Favicon proxy - avoids 404s from Google for private sites
router.get('/favicon', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url required' });
  if (!isUrlSafe(url)) return res.status(400).json({ error: 'Invalid or blocked URL' });
  try {
    const fetch = require('node-fetch');
    const domain = new URL(url).hostname;
    // Try Google first
    const gResp = await fetch(`https://www.google.com/s2/favicons?sz=64&domain=${domain}`, { timeout: 3000 });
    if (gResp.ok) {
      const buf = await gResp.buffer();
      // Google returns a default 16x16 globe for unknown domains - check size
      if (buf.length > 500) {
        res.setHeader('Content-Type', gResp.headers.get('content-type') || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return res.send(buf);
      }
    }
    // Fallback: try site directly
    const siteResp = await fetch(`https://${domain}/favicon.ico`, { timeout: 3000 });
    if (siteResp.ok) {
      const buf = await siteResp.buffer();
      res.setHeader('Content-Type', 'image/x-icon');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      return res.send(buf);
    }
  } catch (e) {}
  // Generate SVG letter
  const name = req.query.name || new URL(url).hostname.charAt(0);
  const letter = (name.charAt(0) || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="#6c5ce7" width="64" height="64" rx="14"/><text x="32" y="43" font-size="32" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold">${letter}</text></svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.send(svg);
});

module.exports = router;
