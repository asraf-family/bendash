const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/alerts - returns recent alerts (last 50) with unseen count
router.get('/', (req, res) => {
  try {
    const alerts = db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50').all();
    const unseen = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE seen = 0').get();
    res.json({ alerts, unseenCount: unseen.count });
  } catch (err) {
    console.error('Alerts GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// PUT /api/alerts/seen-all - mark all as seen
router.put('/seen-all', (req, res) => {
  try {
    db.prepare('UPDATE alerts SET seen = 1 WHERE seen = 0').run();
    res.json({ success: true });
  } catch (err) {
    console.error('Alerts seen-all error:', err.message);
    res.status(500).json({ error: 'Failed to mark all as seen' });
  }
});

// PUT /api/alerts/:id/seen - mark single alert as seen
router.put('/:id/seen', (req, res) => {
  try {
    const result = db.prepare('UPDATE alerts SET seen = 1 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Alerts seen error:', err.message);
    res.status(500).json({ error: 'Failed to mark alert as seen' });
  }
});

// DELETE /api/alerts/clear - delete all alerts
router.delete('/clear', (req, res) => {
  try {
    db.prepare('DELETE FROM alerts').run();
    res.json({ success: true });
  } catch (err) {
    console.error('Alerts clear error:', err.message);
    res.status(500).json({ error: 'Failed to clear alerts' });
  }
});

// DELETE /api/alerts/:id - delete single alert
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Alerts DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

module.exports = router;
