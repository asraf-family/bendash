const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all items
router.get('/', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM shopping_list ORDER BY checked ASC, sort_order ASC, created_at DESC').all();
    res.json(items);
  } catch (err) {
    console.error('Shopping GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch shopping list' });
  }
});

// POST add item
router.post('/', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM shopping_list').get();
    const sortOrder = (maxOrder.m || 0) + 1;
    const result = db.prepare('INSERT INTO shopping_list (text, sort_order) VALUES (?, ?)').run(text.trim(), sortOrder);
    const item = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    console.error('Shopping POST error:', err.message);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// PUT toggle checked
router.put('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    db.prepare('UPDATE shopping_list SET checked = ? WHERE id = ?').run(item.checked ? 0 : 1, id);
    const updated = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Shopping toggle error:', err.message);
    res.status(500).json({ error: 'Failed to toggle item' });
  }
});

// DELETE all checked items (must be before /:id to avoid matching "checked" as an id)
router.delete('/checked', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM shopping_list WHERE checked = 1').run();
    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    console.error('Shopping clear checked error:', err.message);
    res.status(500).json({ error: 'Failed to clear checked items' });
  }
});

// DELETE single item
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM shopping_list WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Shopping DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
