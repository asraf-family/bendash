const express = require('express');
const router = express.Router();
const fetch = globalThis.fetch || require('node-fetch');

const FRIGATE_URL = process.env.FRIGATE_URL || 'http://192.168.0.13:30194';

// GET /api/frigate/cameras - list cameras with latest snapshot URLs
router.get('/cameras', async (req, res) => {
  try {
    const resp = await fetch(`${FRIGATE_URL}/api/config`);
    const config = await resp.json();
    const cameras = Object.keys(config.cameras || {}).map(name => ({
      name,
      snapshotUrl: `/api/frigate/snapshot/${name}`,
    }));
    res.json(cameras);
  } catch (err) {
    console.error('Frigate cameras error:', err.message);
    res.json([]);
  }
});

// GET /api/frigate/snapshot/:camera - proxy camera snapshot
router.get('/snapshot/:camera', async (req, res) => {
  try {
    const camera = req.params.camera.replace(/[^a-zA-Z0-9_-]/g, '');
    const resp = await fetch(`${FRIGATE_URL}/api/${camera}/latest.jpg?h=300`);
    if (!resp.ok) return res.status(404).send('Not found');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-cache');
    resp.body.pipe(res);
  } catch (err) {
    res.status(500).send('Error');
  }
});

// GET /api/frigate/events - recent detection events
router.get('/events', async (req, res) => {
  try {
    const after = Math.floor(Date.now() / 1000) - 3600;
    const resp = await fetch(`${FRIGATE_URL}/api/events?limit=50&has_snapshot=1&after=${after}`);
    const events = await resp.json();
    res.json(events.map(e => ({
      id: e.id,
      camera: e.camera,
      label: e.label,
      score: e.top_score,
      time: e.start_time,
      snapshotUrl: `/api/frigate/event-snapshot/${e.id}`,
    })));
  } catch (err) {
    console.error('Frigate events error:', err.message);
    res.json([]);
  }
});

// GET /api/frigate/stream/:camera - return MJPEG stream URL for a camera
router.get('/stream/:camera', async (req, res) => {
  try {
    const camera = req.params.camera.replace(/[^a-zA-Z0-9_-]/g, '');
    // Return the direct MJPEG stream URL from Frigate
    res.json({ streamUrl: `${FRIGATE_URL}/api/${camera}` });
  } catch (err) {
    console.error('Frigate stream error:', err.message);
    res.status(500).json({ error: 'Unable to get stream URL' });
  }
});

// GET /api/frigate/recordings/:camera - list recordings for a camera
router.get('/recordings/:camera', async (req, res) => {
  try {
    const camera = req.params.camera.replace(/[^a-zA-Z0-9_-]/g, '');
    const after = req.query.after || (Math.floor(Date.now() / 1000) - 86400); // default last 24h
    const before = req.query.before || Math.floor(Date.now() / 1000);
    const resp = await fetch(`${FRIGATE_URL}/api/${camera}/recordings?after=${after}&before=${before}`);
    if (!resp.ok) return res.status(resp.status).json({ error: 'Frigate returned ' + resp.status });
    const recordings = await resp.json();
    res.json(recordings);
  } catch (err) {
    console.error('Frigate recordings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frigate/event-snapshot/:id - proxy event snapshot
router.get('/event-snapshot/:id', async (req, res) => {
  try {
    const id = req.params.id.replace(/[^a-zA-Z0-9._-]/g, '');
    const resp = await fetch(`${FRIGATE_URL}/api/events/${id}/snapshot.jpg`);
    if (!resp.ok) return res.status(404).send('Not found');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    resp.body.pipe(res);
  } catch (err) {
    res.status(500).send('Error');
  }
});

module.exports = router;
