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
      const hostname = new URL(url).hostname;
      iconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
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

module.exports = router;
