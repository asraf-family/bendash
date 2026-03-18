const express = require('express');
const router = express.Router();
const db = require('../db');

// GET widget order
router.get('/', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM widget_order ORDER BY sort_order ASC').all();
    res.json(order);
  } catch (err) {
    console.error('Widget order GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch widget order' });
  }
});

// PUT save widget order
router.put('/', (req, res) => {
  try {
    const items = req.body; // [{widget_id, sort_order}]
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Array of {widget_id, sort_order} required' });
    }

    const upsert = db.prepare('INSERT INTO widget_order (widget_id, sort_order) VALUES (?, ?) ON CONFLICT(widget_id) DO UPDATE SET sort_order = excluded.sort_order');
    const save = db.transaction((items) => {
      for (const item of items) {
        upsert.run(item.widget_id, item.sort_order);
      }
    });
    save(items);
    res.json({ success: true });
  } catch (err) {
    console.error('Widget order PUT error:', err.message);
    res.status(500).json({ error: 'Failed to save widget order' });
  }
});

// GET widget sizes
router.get('/sizes', (req, res) => {
  try {
    const sizes = db.prepare('SELECT * FROM widget_sizes').all();
    res.json(sizes);
  } catch (err) {
    console.error('Widget sizes GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch widget sizes' });
  }
});

// PUT save widget sizes
router.put('/sizes', (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Array of {widget_id, width, height} required' });
    }

    const upsert = db.prepare('INSERT INTO widget_sizes (widget_id, width, height) VALUES (?, ?, ?) ON CONFLICT(widget_id) DO UPDATE SET width = excluded.width, height = excluded.height');
    const save = db.transaction((items) => {
      for (const item of items) {
        upsert.run(item.widget_id, item.width || 1, item.height || 'auto');
      }
    });
    save(items);
    res.json({ success: true });
  } catch (err) {
    console.error('Widget sizes PUT error:', err.message);
    res.status(500).json({ error: 'Failed to save widget sizes' });
  }
});

module.exports = router;
