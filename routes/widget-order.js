const express = require('express');
const router = express.Router();
const db = require('../db');

// Internal: fetch merged widget order + sizes
function getWidgetOrderWithSizes() {
  return db.prepare(`
    SELECT wo.widget_id, wo.sort_order,
           COALESCE(ws.width, 1) AS width,
           COALESCE(ws.height, 'auto') AS height,
           1 AS visible
    FROM widget_order wo
    LEFT JOIN widget_sizes ws ON wo.widget_id = ws.widget_id
    ORDER BY wo.sort_order ASC
  `).all();
}

// GET widget order (merged with sizes)
router.get('/', (req, res) => {
  try {
    res.json(getWidgetOrderWithSizes());
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

// GET widget sizes (backward compat — returns same merged data)
router.get('/sizes', (req, res) => {
  try {
    res.json(getWidgetOrderWithSizes());
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
