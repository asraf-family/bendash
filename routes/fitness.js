const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const FITNESS_URL = process.env.FITNESS_URL || 'http://192.168.0.139:3000';
const FITNESS_USER = process.env.FITNESS_USER || 'ben';

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

router.get('/summary', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) return res.json(cache.data);

    const [dailyResp, metricsResp, workoutResp] = await Promise.all([
      fetch(`${FITNESS_URL}/api/daily-log?userId=${FITNESS_USER}`).then(r => r.json()).catch(() => null),
      fetch(`${FITNESS_URL}/api/metrics?userId=${FITNESS_USER}&limit=1`).then(r => r.json()).catch(() => null),
      fetch(`${FITNESS_URL}/api/workouts?userId=${FITNESS_USER}&limit=1`).then(r => r.json()).catch(() => null),
    ]);

    const result = {
      daily: dailyResp,
      latestWeight: metricsResp,
      lastWorkout: workoutResp,
    };

    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Fitness error:', err.message);
    res.json({ error: true });
  }
});

module.exports = router;
