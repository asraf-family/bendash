const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/settings — return all settings as key-value object
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    console.error('Settings GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings — upsert a setting { key, value }
router.put('/', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    res.json({ ok: true, key, value });
  } catch (err) {
    console.error('Settings PUT error:', err.message);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// GET /api/settings/env-info — return which env vars are configured (names only, not values)
router.get('/env-info', (req, res) => {
  const envVars = [
    { name: 'WEATHER_LAT', label: 'Weather Latitude', group: 'Weather' },
    { name: 'WEATHER_LON', label: 'Weather Longitude', group: 'Weather' },
    { name: 'HEBITS_RSS_URL', label: 'Hebits RSS URL', group: 'RSS' },
    { name: 'JELLYFIN_URL', label: 'Jellyfin URL', group: 'Media' },
    { name: 'JELLYFIN_API_KEY', label: 'Jellyfin API Key', group: 'Media' },
    { name: 'JELLYFIN_USER_ID', label: 'Jellyfin User ID', group: 'Media' },
    { name: 'TAUTULLI_URL', label: 'Tautulli URL', group: 'Media' },
    { name: 'TAUTULLI_API_KEY', label: 'Tautulli API Key', group: 'Media' },
    { name: 'JELLYSTAT_URL', label: 'Jellystat URL', group: 'Media' },
    { name: 'JELLYSTAT_API_KEY', label: 'Jellystat API Key', group: 'Media' },
    { name: 'QBIT_URL', label: 'qBittorrent URL', group: 'Downloads' },
    { name: 'QBIT_USER', label: 'qBittorrent User', group: 'Downloads' },
    { name: 'QBIT_PASS', label: 'qBittorrent Password', group: 'Downloads' },
    { name: 'TRUENAS_URL', label: 'TrueNAS URL', group: 'Storage' },
    { name: 'TRUENAS_API_KEY', label: 'TrueNAS API Key', group: 'Storage' },
    { name: 'CONTROL_PANEL_URL', label: 'Control Panel URL', group: 'System' },
    { name: 'CONTROL_PANEL_PASS', label: 'Control Panel Password', group: 'System' },
    { name: 'UNIFI_URL', label: 'UniFi URL', group: 'Network' },
    { name: 'UNIFI_USER', label: 'UniFi User', group: 'Network' },
    { name: 'UNIFI_PASS', label: 'UniFi Password', group: 'Network' },
    { name: 'CALENDAR_SOURCE_URL', label: 'Calendar Source URL', group: 'Calendar' },
    { name: 'ADGUARD_URL', label: 'AdGuard URL', group: 'AdGuard' },
    { name: 'ADGUARD_USER', label: 'AdGuard User', group: 'AdGuard' },
    { name: 'ADGUARD_PASS', label: 'AdGuard Password', group: 'AdGuard' },
    { name: 'FITNESS_URL', label: 'Fitness App URL', group: 'Fitness' },
    { name: 'FITNESS_USER', label: 'Fitness User', group: 'Fitness' },
    { name: 'FRIGATE_URL', label: 'Frigate URL', group: 'Frigate' },
    { name: 'DEFAULT_STOCKS', label: 'Default Stocks', group: 'Stocks' },
  ];

  const result = envVars.map(v => ({
    name: v.name,
    label: v.label,
    group: v.group,
    configured: !!process.env[v.name],
  }));

  res.json(result);
});

module.exports = router;
