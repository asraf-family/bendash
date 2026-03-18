require('dotenv').config();

const express = require('express');
const path = require('path');

// Initialize database (creates tables + seeds data)
require('./db');

const app = express();
const PORT = process.env.PORT || 7575;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/weather', require('./routes/weather'));
app.use('/api/rss', require('./routes/rss'));
app.use('/api/bookmarks', require('./routes/bookmarks'));
app.use('/api/services', require('./routes/services'));
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/media', require('./routes/media'));
app.use('/api/alfred-apps', require('./routes/alfred-apps'));
app.use('/api/qbit', require('./routes/qbit'));
app.use('/api/truenas', require('./routes/truenas'));
app.use('/api/widget-order', require('./routes/widget-order'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BenDash running on http://localhost:${PORT}`);
});
