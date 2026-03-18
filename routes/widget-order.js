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

module.exports = router;
