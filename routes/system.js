const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
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

    const memMatch = top.match(/PhysMem:\s*(\d+)([GM])\s*used.*?,\s*(\d+)([GM])\s*unused/);
    if (memMatch) {
      const toMB = (n, unit) => unit === 'G' ? n * 1024 : n;
      memUsed = toMB(parseInt(memMatch[1]), memMatch[2]);
      const memUnused = toMB(parseInt(memMatch[3]), memMatch[4]);
      memTotal = memUsed + memUnused;
    }
  } catch (err) {
    // macOS top failed — try Linux fallbacks
    try {
      cpu = getLinuxCpu();
    } catch (e) {
      console.error('CPU fallback error:', e.message);
    }
    try {
      const mem = getLinuxMemory();
      if (mem) {
        memUsed = mem.used;
        memTotal = mem.total;
      }
    } catch (e) {
      console.error('Memory fallback error:', e.message);
    }
  }

  return { cpu, memUsed, memTotal };
}

function getLinuxCpu() {
  // Use load average as a simple CPU indicator
  const loadavg = fs.readFileSync('/proc/loadavg', 'utf-8');
  const load1 = parseFloat(loadavg.split(' ')[0]);
  const numCpus = require('os').cpus().length || 1;
  return Math.min(100, Math.round((load1 / numCpus) * 100));
}

function getLinuxMemory() {
  const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8');
  const getValue = (key) => {
    const match = meminfo.match(new RegExp(`${key}:\\s*(\\d+)`));
    return match ? parseInt(match[1]) : null;
  };
  const totalKB = getValue('MemTotal');
  const availableKB = getValue('MemAvailable');
  if (totalKB == null || availableKB == null) return null;
  const totalMB = Math.round(totalKB / 1024);
  const usedMB = Math.round((totalKB - availableKB) / 1024);
  return { total: totalMB, used: usedMB };
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
