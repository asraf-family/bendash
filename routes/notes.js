const express = require('express');
const router = express.Router();
const db = require('../db');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// GET today's note (creates if not exists)
router.get('/today', (req, res) => {
  try {
    const date = todayStr();
    let note = db.prepare('SELECT * FROM notes WHERE date = ?').get(date);
    if (!note) {
      db.prepare('INSERT INTO notes (date, content) VALUES (?, ?)').run(date, '');
      note = db.prepare('SELECT * FROM notes WHERE date = ?').get(date);
    }
    res.json(note);
  } catch (err) {
    console.error('Notes GET today error:', err.message);
    res.status(500).json({ error: 'Failed to fetch today note' });
  }
});

// PUT update today's note
router.put('/today', (req, res) => {
  try {
    const { content } = req.body;
    if (content === undefined) {
      return res.status(400).json({ error: 'content is required' });
    }
    const date = todayStr();
    // Upsert
    db.prepare(
      'INSERT INTO notes (date, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP'
    ).run(date, content);
    const note = db.prepare('SELECT * FROM notes WHERE date = ?').get(date);
    res.json(note);
  } catch (err) {
    console.error('Notes PUT today error:', err.message);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// GET yesterday's note
router.get('/yesterday', (req, res) => {
  try {
    const date = yesterdayStr();
    const note = db.prepare('SELECT * FROM notes WHERE date = ?').get(date);
    res.json(note || { date, content: '' });
  } catch (err) {
    console.error('Notes GET yesterday error:', err.message);
    res.status(500).json({ error: 'Failed to fetch yesterday note' });
  }
});

module.exports = router;
