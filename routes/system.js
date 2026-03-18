const express = require('express');
const { execSync } = require('child_process');
const fetch = require('node-fetch');
const https = require('https');
const router = express.Router();

const { TRUENAS_URL, TRUENAS_API_KEY } = process.env;
const agent = new https.Agent({ rejectUnauthorized: false });

let cache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 1000;

function getMacStats() {
  let cpu = null;
  let memUsed = null;
  let memTotal = null;

  try {
    const top = execSync('top -l 1 -n 0', { encoding: 'utf-8', timeout: 10000 });

    const cpuMatch = top.match(/CPU usage:\s*([\d.]+)%\s*user,\s*([\d.]+)%\s*sys/);
    if (cpuMatch) {
      cpu = Math.round(parseFloat(cpuMatch[1]) + parseFloat(cpuMatch[2]));
    }

    const memMatch = top.match(/PhysMem:\s*(\d+\w)\s*used.*?(\d+\w)\s*unused/);
    if (memMatch) {
      const parse = s => {
        const n = parseInt(s);
        if (s.endsWith('G')) return n * 1024;
        return n; // already MB
      };
      memUsed = parse(memMatch[1]);
      const memUnused = parse(memMatch[2]);
      memTotal = memUsed + memUnused;
    }
  } catch (err) {
    console.error('top error:', err.message);
  }

  return { cpu, memUsed, memTotal };
}

function getDiskStats() {
  try {
    const df = execSync('df -h /', { encoding: 'utf-8', timeout: 5000 });
    const lines = df.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      return {
        diskTotal: parts[1] || null,
        diskUsed: parts[2] || null,
        diskPercent: parseInt(parts[4]) || null,
      };
    }
  } catch (err) {
    console.error('df error:', err.message);
  }
  return { diskTotal: null, diskUsed: null, diskPercent: null };
}

async function getTruenasUptime() {
  if (!TRUENAS_URL || !TRUENAS_API_KEY) return null;
  try {
    const resp = await fetch(`${TRUENAS_URL}/api/v2.0/system/info`, {
      headers: { Authorization: `Bearer ${TRUENAS_API_KEY}` },
      agent,
    });
    if (!resp.ok) return null;
    const info = await resp.json();
    if (info.uptime_seconds) {
      return Math.round(info.uptime_seconds / 86400);
    }
    return info.uptime || null;
  } catch {
    return null;
  }
}

router.get('/health', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      return res.json(cache.data);
    }

    const [macStats, diskStats, truenasUptime] = await Promise.all([
      Promise.resolve(getMacStats()),
      Promise.resolve(getDiskStats()),
      getTruenasUptime(),
    ]);

    const uptimeSec = process.uptime();
    const uptimeDays = Math.round(require('os').uptime() / 86400);

    const result = {
      cpu: macStats.cpu,
      memUsed: macStats.memUsed,
      memTotal: macStats.memTotal,
      ...diskStats,
      uptimeDays,
      truenasUptime,
    };

    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('System health error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
