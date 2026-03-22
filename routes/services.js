const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const https = require('https');
const db = require('../db');

// Allow self-signed certs for internal services
const agent = new https.Agent({ rejectUnauthorized: false });

let cache = { data: null, ts: 0 };
const CACHE_TTL = 15 * 1000; // 15 seconds

// Track last known status for transition detection
const lastStatus = new Map();

function checkTransition(result) {
  const prev = lastStatus.get(result.id);
  lastStatus.set(result.id, result.online);

  // Skip first check (no previous state to compare)
  if (prev === undefined) return;
  // No change
  if (prev === result.online) return;

  const type = result.online ? 'recovery' : 'down';
  const message = result.online
    ? `${result.name} is back online`
    : `${result.name} went offline`;

  try {
    db.prepare('INSERT INTO alerts (type, source, message) VALUES (?, ?, ?)').run(type, result.name, message);
  } catch (err) {
    console.error('Alert insert error:', err.message);
  }
}

// Store ping result in service_history
function recordPing(result) {
  try {
    db.prepare(
      'INSERT INTO service_history (service_id, online, response_time) VALUES (?, ?, ?)'
    ).run(result.id, result.online ? 1 : 0, result.responseTimeMs || null);
  } catch (err) {
    console.error('History insert error:', err.message);
  }
}

// Purge history older than 24h
function purgeOldHistory() {
  try {
    db.prepare(
      "DELETE FROM service_history WHERE timestamp < datetime('now', '-24 hours')"
    ).run();
  } catch (err) {
    console.error('History purge error:', err.message);
  }
}

// Calculate uptime percent for a service over last 24h
function getUptimePercent(serviceId) {
  const row = db.prepare(
    "SELECT COUNT(*) as total, SUM(online) as up FROM service_history WHERE service_id = ? AND timestamp >= datetime('now', '-24 hours')"
  ).get(serviceId);
  if (!row || row.total === 0) return null;
  return Math.round((row.up / row.total) * 1000) / 10; // one decimal
}

async function pingService(service) {
  const timeoutMs = service.timeout || 5000;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const opts = { signal: controller.signal };
    if (service.url.startsWith('https')) {
      opts.agent = agent;
    }

    const start = Date.now();
    const resp = await fetch(service.url, opts);
    const responseTimeMs = Date.now() - start;
    clearTimeout(timeout);

    return {
      id: service.id,
      name: service.name,
      url: service.url,
      icon: service.icon,
      online: resp.status < 500,
      statusCode: resp.status,
      responseTimeMs,
    };
  } catch (err) {
    return {
      id: service.id,
      name: service.name,
      url: service.url,
      icon: service.icon,
      online: false,
      error: err.type === 'aborted' ? 'timeout' : err.code || err.message,
      responseTimeMs: null,
    };
  }
}

// GET all services (with live ping status + uptime)
router.get('/', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      return res.json(cache.data);
    }

    const services = db.prepare('SELECT * FROM services ORDER BY sort_order ASC').all();
    const results = await Promise.all(services.map(pingService));
    results.forEach(checkTransition);
    results.forEach(recordPing);

    // Purge old history periodically (piggyback on fetch)
    purgeOldHistory();

    // Attach uptime percent to each result
    for (const r of results) {
      r.uptimePercent = getUptimePercent(r.id);
    }

    cache = { data: results, ts: Date.now() };
    res.json(results);
  } catch (err) {
    console.error('Services error:', err.message);
    res.status(500).json({ error: 'Failed to check services' });
  }
});

// GET history for a specific service (last 24h)
router.get('/history/:name', (req, res) => {
  try {
    const { name } = req.params;
    const service = db.prepare('SELECT id FROM services WHERE name = ?').get(name);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const rows = db.prepare(
      "SELECT online, response_time as responseTime, timestamp FROM service_history WHERE service_id = ? AND timestamp >= datetime('now', '-24 hours') ORDER BY timestamp ASC"
    ).all(service.id);

    res.json(rows);
  } catch (err) {
    console.error('Service history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST add a new service
router.post('/', (req, res) => {
  try {
    const { name, url, icon, timeout } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }

    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM services').get();
    const sortOrder = (maxOrder.m || 0) + 1;
    const timeoutVal = timeout || 5000;

    const result = db.prepare('INSERT INTO services (name, url, icon, sort_order, timeout) VALUES (?, ?, ?, ?, ?)').run(name, url, icon || '🔗', sortOrder, timeoutVal);
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
    // Also delete history for this service
    db.prepare('DELETE FROM service_history WHERE service_id = ?').run(id);
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
