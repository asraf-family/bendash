const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const https = require('https');

// Allow self-signed certs for internal services
const agent = new https.Agent({ rejectUnauthorized: false });

const SERVICES = [
  { name: 'Plex', url: 'http://192.168.0.13:32400', icon: '🎬' },
  { name: 'Jellyfin', url: 'http://192.168.0.13:30013', icon: '🎥' },
  { name: 'Vaultwarden', url: 'https://bitwarden.bini541.com', icon: '🔐' },
  { name: 'qBittorrent', url: 'http://192.168.0.13:30024', icon: '⬇️' },
  { name: 'TrueNAS', url: 'http://192.168.0.13', icon: '💾' },
  { name: 'Home Assistant', url: 'http://192.168.0.130:8123', icon: '🏠' },
  { name: 'AdGuard', url: 'http://192.168.0.68', icon: '🛡️' },
  { name: 'Proxmox', url: 'https://192.168.0.66:8006', icon: '🖥️' },
  { name: 'Kavita', url: 'http://192.168.0.13:30069', icon: '📚' },
  { name: 'UniFi', url: 'https://192.168.0.1', icon: '📡' },
  { name: 'ASUSTOR', url: 'http://192.168.0.191:8009', icon: '🗄️' },
  { name: 'Portainer', url: 'https://192.168.0.67:9443', icon: '🐳' },
];

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
      name: service.name,
      url: service.url,
      icon: service.icon,
      online: resp.status < 500,
      statusCode: resp.status,
    };
  } catch (err) {
    return {
      name: service.name,
      url: service.url,
      icon: service.icon,
      online: false,
      error: err.type === 'aborted' ? 'timeout' : err.code || err.message,
    };
  }
}

router.get('/', async (req, res) => {
  try {
    const results = await Promise.all(SERVICES.map(pingService));
    res.json(results);
  } catch (err) {
    console.error('Services error:', err.message);
    res.status(500).json({ error: 'Failed to check services' });
  }
});

module.exports = router;
