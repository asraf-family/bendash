const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const https = require('https');
const db = require('../db');

// Allow self-signed certs for internal services
const agent = new https.Agent({ rejectUnauthorized: false });

async function pingService(service) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const opts = { signal: controller.signal };
    if (service.url.startsWith('https')) {
      opts.agent = agent;
    }

    const resp = await fetch(service.url, opts);
    clearTimeout(timeout);

    return {
      id: service.id,
      name: service.name,
      url: service.url,
      icon: service.icon,
      online: resp.status < 500,
      statusCode: resp.status,
    };
  } catch (err) {
    return {
      id: service.id,
      name: service.name,
      url: service.url,
      icon: service.icon,
      online: false,
      error: err.type === 'aborted' ? 'timeout' : err.code || err.message,
    };
  }
}

// GET all services (with live ping status)
router.get('/', async (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services ORDER BY sort_order ASC').all();
    const results = await Promise.all(services.map(pingService));
    res.json(results);
  } catch (err) {
    console.error('Services error:', err.message);
    res.status(500).json({ error: 'Failed to check services' });
  }
});

// POST add a new service
router.post('/', (req, res) => {
  try {
    const { name, url, icon } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM services').get();
    const sortOrder = (maxOrder.m || 0) + 1;

    const result = db.prepare('INSERT INTO services (name, url, icon, sort_order) VALUES (?, ?, ?, ?)').run(name, url, icon || '🔗', sortOrder);
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(service);
  } catch (err) {
    console.error('Services POST error:', err.message);
    res.status(500).json({ error: 'Failed to add service' });
  }
});

// DELETE a service
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM services WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Services DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// PUT reorder services
router.put('/reorder', (req, res) => {
  try {
    const items = req.body; // [{id, sort_order}]
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Array of {id, sort_order} required' });
    }

    const update = db.prepare('UPDATE services SET sort_order = ? WHERE id = ?');
    const reorder = db.transaction((items) => {
      for (const item of items) {
        update.run(item.sort_order, item.id);
      }
    });
    reorder(items);
    res.json({ success: true });
  } catch (err) {
    console.error('Services reorder error:', err.message);
    res.status(500).json({ error: 'Failed to reorder services' });
  }
});

module.exports = router;
