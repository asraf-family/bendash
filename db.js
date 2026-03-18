const Database = require('better-sqlite3');
const path = require('path');

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
`);

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
      const iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
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

module.exports = db;
