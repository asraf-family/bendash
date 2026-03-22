const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const dbPath = path.join(__dirname, 'data', 'bendash.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT DEFAULT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT DEFAULT '🔗',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS widget_order (
    widget_id TEXT PRIMARY KEY,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS widget_sizes (
    widget_id TEXT PRIMARY KEY,
    width INTEGER DEFAULT 1,
    height TEXT DEFAULT 'auto'
  );

  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    seen INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add visible column to widget_sizes if it doesn't exist yet
try { db.exec('ALTER TABLE widget_sizes ADD COLUMN visible INTEGER DEFAULT 1'); } catch(e) {}

// Seed default bookmarks if table is empty
const count = db.prepare('SELECT COUNT(*) as c FROM bookmarks').get();
if (count.c === 0) {
  const defaultBookmarks = [
    { name: 'One', url: 'https://www.one.co.il' },
    { name: 'Sport5', url: 'https://www.sport5.co.il' },
    { name: 'Facebook', url: 'https://www.facebook.com' },
    { name: 'iptorrents', url: 'https://iptorrents.me/t' },
    { name: 'Fuzer', url: 'https://www.fuzer.xyz/index.php' },
    { name: 'Hebits', url: 'https://hebits.net' },
    { name: 'Gmail', url: 'https://mail.google.com' },
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Photos', url: 'https://photos.google.com' },
    { name: 'Geektime', url: 'https://www.geektime.co.il' },
    { name: 'TGspot', url: 'https://www.tgspot.co.il' },
    { name: 'gadgety', url: 'https://www.gadgety.co.il' },
  ];

  const insert = db.prepare('INSERT INTO bookmarks (name, url, icon, sort_order) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((items) => {
    items.forEach((item, i) => {
      const iconUrl = `/api/bookmarks/favicon?url=${encodeURIComponent(item.url)}`;
      insert.run(item.name, item.url, iconUrl, i);
    });
  });
  insertMany(defaultBookmarks);
  console.log('Seeded default bookmarks');
}

// Seed default stocks if table is empty
const stockCount = db.prepare('SELECT COUNT(*) as c FROM stocks').get();
if (stockCount.c === 0) {
  const defaultStocks = (process.env.DEFAULT_STOCKS || 'AKAM,^GSPC,QQQ,VOO,NVDA,MSFT,GOOGL').split(',');
  const insertStock = db.prepare('INSERT INTO stocks (symbol, sort_order) VALUES (?, ?)');
  const insertStocks = db.transaction((symbols) => {
    symbols.forEach((symbol, i) => {
      insertStock.run(symbol.trim(), i);
    });
  });
  insertStocks(defaultStocks);
  console.log('Seeded default stocks');
}

// Seed default services if table is empty
const serviceCount = db.prepare('SELECT COUNT(*) as c FROM services').get();
if (serviceCount.c === 0) {
  const defaultServices = [
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

  const insertService = db.prepare('INSERT INTO services (name, url, icon, sort_order) VALUES (?, ?, ?, ?)');
  const insertServices = db.transaction((items) => {
    items.forEach((item, i) => {
      insertService.run(item.name, item.url, item.icon, i);
    });
  });
  insertServices(defaultServices);
  console.log('Seeded default services');
}

// Cache helpers
function getCache(key) {
  const row = db.prepare('SELECT data FROM cache WHERE key = ? AND expires_at > ?').get(key, Date.now());
  return row ? JSON.parse(row.data) : null;
}

function setCache(key, data, ttlMs) {
  db.prepare('INSERT OR REPLACE INTO cache (key, data, expires_at) VALUES (?, ?, ?)').run(key, JSON.stringify(data), Date.now() + ttlMs);
}

function clearCache(key) {
  db.prepare('DELETE FROM cache WHERE key = ?').run(key);
}

// Attach cache helpers to db export for convenience
db.getCache = getCache;
db.setCache = setCache;
db.clearCache = clearCache;

module.exports = db;
