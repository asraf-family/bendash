const express = require('express');
const { execSync } = require('child_process');
const fetch = require('node-fetch');
const router = express.Router();

let cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;

router.get('/', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      return res.json(cache.data);
    }

    let events = [];

    // Try gog CLI first (works on Mac mini)
    try {
      const raw = execSync('gog calendar list --days 2 --json', {
        timeout: 10000,
        encoding: 'utf-8',
      });
      const parsed = JSON.parse(raw);
      events = (Array.isArray(parsed) ? parsed : parsed.events || []).map(e => ({
        title: e.title || e.summary || e.name || 'Untitled',
        start: e.start || e.startTime || e.start_time || null,
        end: e.end || e.endTime || e.end_time || null,
        allDay: e.allDay || e.all_day || false,
        calendar: e.calendar || e.calendarName || null,
        color: e.color || null,
      }));
    } catch (err) {
      console.error('gog calendar error:', err.message);

      // Fallback: fetch from Mac mini calendar proxy (for Docker)
      const calendarSourceUrl = process.env.CALENDAR_SOURCE_URL;
      if (calendarSourceUrl) {
        try {
          const resp = await fetch(calendarSourceUrl, { timeout: 10000 });
          if (resp.ok) {
            events = await resp.json();
          }
        } catch (e) {
          console.error('Calendar source fallback error:', e.message);
        }
      }
    }

    cache = { data: events, ts: Date.now() };
    res.json(events);
  } catch (err) {
    console.error('Calendar error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
