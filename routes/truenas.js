const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const { TRUENAS_URL, TRUENAS_API_KEY } = process.env;

const agent = new https.Agent({ rejectUnauthorized: false });

async function truenasFetch(path) {
  const resp = await fetch(`${TRUENAS_URL}${path}`, {
    headers: { Authorization: `Bearer ${TRUENAS_API_KEY}` },
    agent,
  });
  if (!resp.ok) throw new Error(`TrueNAS API ${path} returned ${resp.status}`);
  return resp.json();
}

router.get('/status', async (req, res) => {
  try {
    const [pools, apps] = await Promise.all([
      truenasFetch('/api/v2.0/pool'),
      truenasFetch('/api/v2.0/app'),
    ]);

    const poolData = pools.map(p => {
      let totalBytes = 0;
      let usedBytes = 0;
      if (p.topology && p.topology.data) {
        for (const vdev of p.topology.data) {
          const stats = vdev.stats || {};
          totalBytes += stats.size || 0;
          usedBytes += stats.allocated || 0;
        }
      }
      const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
      return {
        name: p.name,
        status: p.status,
        healthy: p.healthy,
        totalBytes,
        usedBytes,
        usedPercent,
      };
    });

    const appData = apps.map(a => ({
      name: a.name,
      state: a.state,
    }));

    res.json({ pools: poolData, apps: appData });
  } catch (err) {
    console.error('TrueNAS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
