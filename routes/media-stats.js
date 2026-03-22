const express = require('express');
const fetch = globalThis.fetch || require('node-fetch');
const router = express.Router();

const JF_URL = process.env.JELLYFIN_URL;
const JF_KEY = process.env.JELLYFIN_API_KEY;
const JF_USER = process.env.JELLYFIN_USER_ID;
const JS_URL = process.env.JELLYSTAT_URL;
const JS_KEY = process.env.JELLYSTAT_API_KEY;

function jfHeaders() {
  return { 'X-Emby-Token': JF_KEY };
}

// GET /api/media-stats
router.get('/', async (req, res) => {
  try {
    let movieCount = 0, seriesCount = 0, episodeCount = 0;

    // Jellyfin item counts
    if (JF_URL && JF_KEY) {
      try {
        const resp = await fetch(`${JF_URL}/Items/Counts?api_key=${JF_KEY}`);
        const data = await resp.json();
        movieCount = data.MovieCount || 0;
        seriesCount = data.SeriesCount || 0;
        episodeCount = data.EpisodeCount || 0;
      } catch (e) {
        console.error('Jellyfin counts error:', e.message);
      }
    }

    // Jellystat watch stats
    let watchedThisMonth = null;
    let totalPlayTimeHours = null;

    if (JS_URL && JS_KEY) {
      const jsHeaders = { 'x-api-token': JS_KEY };
      // Try known Jellystat API endpoints for watch statistics
      const endpoints = [
        '/api/getViewsOverTime',
        '/api/statistics',
        '/stats',
      ];
      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(`${JS_URL}${endpoint}`, { headers: jsHeaders });
          if (resp.ok) {
            const data = await resp.json();
            watchedThisMonth = data.watchedThisMonth ?? data.watched_this_month ?? null;
            totalPlayTimeHours = data.totalPlayTimeHours ?? data.total_play_time_hours ?? null;
            break;
          }
        } catch (e) {
          console.error(`Jellystat ${endpoint} error:`, e.message);
        }
      }
    }

    res.json({ movieCount, seriesCount, episodeCount, watchedThisMonth, totalPlayTimeHours });
  } catch (err) {
    console.error('Media stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media-stats/random — random unwatched movie (with optional filters)
router.get('/random', async (req, res) => {
  try {
    if (!JF_URL || !JF_KEY || !JF_USER) {
      return res.json(null);
    }

    let url = `${JF_URL}/Users/${JF_USER}/Items?IncludeItemTypes=Movie&IsPlayed=false&Recursive=true&SortBy=Random&Limit=1&Fields=Overview,PrimaryImageTag,CommunityRating,ProductionYear&api_key=${JF_KEY}`;

    const { genre, minRating, maxRuntime } = req.query;
    if (genre) url += `&Genres=${encodeURIComponent(genre)}`;
    if (minRating) url += `&MinCommunityRating=${encodeURIComponent(minRating)}`;
    if (maxRuntime) {
      // Jellyfin expects MaxRuntime in ticks (1 min = 600000000 ticks)
      const ticks = Number(maxRuntime) * 600000000;
      url += `&MaxRuntime=${ticks}`;
    }

    const resp = await fetch(url, { headers: jfHeaders() });
    const data = await resp.json();
    const item = (data.Items || [])[0];

    if (!item) return res.json(null);

    res.json({
      id: item.Id,
      name: item.Name,
      year: item.ProductionYear || null,
      overview: item.Overview || null,
      rating: item.CommunityRating || null,
      posterId: item.Id,
      runtime: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : null,
    });
  } catch (err) {
    console.error('Random movie error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
