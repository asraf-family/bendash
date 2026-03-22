const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const JF_URL = process.env.JELLYFIN_URL;
const JF_KEY = process.env.JELLYFIN_API_KEY;
const JF_USER = process.env.JELLYFIN_USER_ID;
const TAU_URL = process.env.TAUTULLI_URL;
const TAU_KEY = process.env.TAUTULLI_API_KEY;
const JS_URL = process.env.JELLYSTAT_URL;
const JS_KEY = process.env.JELLYSTAT_API_KEY;

function jfHeaders() {
  return { 'X-Emby-Token': JF_KEY };
}

function jfImageUrl(itemId) {
  return `${JF_URL}/Items/${itemId}/Images/Primary?maxHeight=300&api_key=${JF_KEY}`;
}

// Continue Watching
router.get('/continue', async (req, res) => {
  try {
    const resp = await fetch(
      `${JF_URL}/Users/${JF_USER}/Items/Resume?Limit=10&Fields=Overview,PrimaryImageTag`,
      { headers: jfHeaders() }
    );
    const data = await resp.json();
    const items = (data.Items || []).map(item => ({
      id: item.Id,
      name: item.Name,
      type: item.Type,
      seriesName: item.SeriesName || null,
      episodeTitle: item.Type === 'Episode' ? item.Name : null,
      imagePrimary: `/api/media/poster/${item.SeriesId || item.Id}`,
      deepLink: `${JF_URL}/web/index.html#!/details?id=${item.Id}`,
      runTimeTicks: item.RunTimeTicks || 0,
      playbackPositionTicks: item.UserData?.PlaybackPositionTicks || 0,
      progressPercent: item.RunTimeTicks
        ? Math.round(((item.UserData?.PlaybackPositionTicks || 0) / item.RunTimeTicks) * 100)
        : 0,
    }));
    res.json(items);
  } catch (err) {
    console.error('Jellyfin continue watching error:', err.message);
    res.status(500).json({ error: 'Failed to fetch continue watching' });
  }
});

// Recently Added
router.get('/recent', async (req, res) => {
  try {
    const resp = await fetch(
      `${JF_URL}/Users/${JF_USER}/Items/Latest?Limit=10&Fields=Overview,PrimaryImageTag,DateCreated`,
      { headers: jfHeaders() }
    );
    const data = await resp.json();
    const items = (Array.isArray(data) ? data : data.Items || []).map(item => ({
      id: item.Id,
      name: item.Name,
      type: item.Type,
      imagePrimary: `/api/media/poster/${item.Id}`,
      deepLink: `${JF_URL}/web/index.html#!/details?id=${item.Id}`,
      dateCreated: item.DateCreated || null,
      overview: item.Overview || null,
    }));
    res.json(items);
  } catch (err) {
    console.error('Jellyfin recently added error:', err.message);
    res.status(500).json({ error: 'Failed to fetch recently added' });
  }
});

// Now Playing (Plex via Tautulli + Jellyfin)
router.get('/playing', async (req, res) => {
  try {
    const results = [];

    // Tautulli (Plex)
    if (TAU_URL && TAU_KEY) {
      try {
        const tauResp = await fetch(`${TAU_URL}/api/v2?apikey=${TAU_KEY}&cmd=get_activity`);
        const tauData = await tauResp.json();
        const sessions = tauData?.response?.data?.sessions || [];
        for (const s of sessions) {
          const totalMin = s.duration ? Math.round(Number(s.duration) / 60000) : 0;
          const posMin = s.view_offset ? Math.round(Number(s.view_offset) / 60000) : 0;
          const vDecision = s.video_decision || '';
          const aDecision = s.audio_decision || '';
          const cDecision = s.container_decision || '';
          // Determine play method like Tautulli shows it
          let playMethod;
          if (vDecision === 'copy' && aDecision === 'copy' && cDecision !== 'transcode') playMethod = 'DirectPlay';
          else if (vDecision === 'copy') playMethod = 'DirectStream';
          else playMethod = 'Transcode';
          const streamLabel = s.transcode_decision === 'transcode' && s.throttled === '1' ? 'Transcode (Throttled)' : '';
          results.push({
            user: s.friendly_name || s.user,
            title: s.full_title || s.title,
            player: s.player || s.platform,
            client: s.product || '',
            progress: s.progress_percent ? Number(s.progress_percent) : 0,
            type: s.media_type || 'unknown',
            source: 'plex',
            isPaused: s.state === 'paused',
            playMethod,
            videoCodec: s.stream_video_codec || s.video_codec || '',
            resolution: s.stream_video_full_resolution || `${s.width}x${s.height}`,
            container: `${(s.container || '').toUpperCase()} → ${(s.stream_container || '').toUpperCase()}`,
            bitrate: s.bandwidth ? `${(Number(s.bandwidth) / 1000).toFixed(1)} Mbps` : '',
            audioCodec: `${(s.audio_codec || '').toUpperCase()} ${s.audio_channel_layout || ''} → ${(s.stream_audio_codec || '').toUpperCase()} ${s.stream_audio_channel_layout || ''}`,
            audioChannels: s.audio_channels || 0,
            quality: s.quality_profile || '',
            positionMin: posMin,
            totalMin: totalMin,
            timeDisplay: `${posMin}m / ${totalMin}m`,
            eta: totalMin > posMin ? `ETA ${totalMin - posMin}m` : '',
            posterId: s.rating_key ? `plex-${s.rating_key}` : null,
            year: s.year || null,
            ip: s.ip_address || '',
            location: s.local === '1' ? 'LAN' : 'WAN',
          });
        }
      } catch (e) {
        console.error('Tautulli error:', e.message);
      }
    }

    // Jellyfin sessions via Jellystat proxy (richer data)
    if (JS_URL && JS_KEY) {
      try {
        const jsResp = await fetch(`${JS_URL}/proxy/getSessions`, { headers: { 'x-api-token': JS_KEY } });
        const jsSessions = await jsResp.json();
        for (const s of jsSessions) {
          if (!s.NowPlayingItem) continue;
          const np = s.NowPlayingItem;
          const posTicks = s.PlayState?.PositionTicks || 0;
          const runTicks = np.RunTimeTicks || 1;
          const playMethod = s.PlayState?.PlayMethod || 'Unknown';
          const isPaused = s.PlayState?.IsPaused || false;
          // Find video stream info
          const videoStream = (np.MediaStreams || []).find(m => m.Type === 'Video') || {};
          const audioStream = (np.MediaStreams || []).find(m => m.Type === 'Audio') || {};
          const ti = s.TranscodingInfo || {};
          const videoCodec = videoStream.Codec || '';
          const resolution = videoStream.Width && videoStream.Height ? `${videoStream.Width}x${videoStream.Height}` : '';
          const container = np.Container || '';
          const bitrate = ti.Bitrate ? `${(ti.Bitrate / 1000000).toFixed(1)} Mbps` : '';
          const totalMin = Math.round(runTicks / 600000000);
          const posMin = Math.round(posTicks / 600000000);
          results.push({
            user: s.UserName || 'Unknown',
            title: np.SeriesName ? `${np.SeriesName} — ${np.Name}` : np.Name,
            player: s.DeviceName || s.Client,
            client: s.Client || '',
            progress: Math.round((posTicks / runTicks) * 100),
            type: np.Type || 'unknown',
            source: 'jellyfin',
            isPaused,
            playMethod,
            videoCodec,
            resolution,
            container,
            bitrate,
            audioCodec: audioStream.Codec || '',
            audioChannels: audioStream.Channels || 0,
            positionMin: posMin,
            totalMin: totalMin,
            timeDisplay: `${posMin}m / ${totalMin}m`,
            posterId: np.SeriesId || np.Id,
            year: np.ProductionYear || null,
            ip: s.RemoteEndPoint || '',
          });
        }
      } catch (e) {
        console.error('Jellystat sessions error:', e.message);
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Now playing error:', err.message);
    res.status(500).json({ error: 'Failed to fetch now playing' });
  }
});

// Next Up (next episodes for in-progress series)
router.get('/nextup', async (req, res) => {
  try {
    const resp = await fetch(
      `${JF_URL}/Shows/NextUp?userId=${JF_USER}&limit=10&Fields=Overview,PrimaryImageTag`,
      { headers: jfHeaders() }
    );
    const data = await resp.json();
    const items = (data.Items || []).map(item => ({
      id: item.Id,
      name: item.Name,
      seriesName: item.SeriesName || null,
      seasonNumber: item.ParentIndexNumber ?? null,
      episodeNumber: item.IndexNumber ?? null,
      imagePrimary: `/api/media/poster/${item.SeriesId || item.Id}`,
      deepLink: `${JF_URL}/web/index.html#!/details?id=${item.Id}`,
    }));
    res.json(items);
  } catch (err) {
    console.error('Jellyfin next up error:', err.message);
    res.status(500).json({ error: 'Failed to fetch next up' });
  }
});

// Poster proxy (Jellyfin + Plex via Tautulli)
router.get('/poster/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!itemId || itemId === 'undefined' || itemId === 'null') {
      return res.status(400).end();
    }
    let resp;
    if (itemId.startsWith('plex-')) {
      const ratingKey = itemId.replace('plex-', '');
      resp = await fetch(`${TAU_URL}/api/v2?apikey=${TAU_KEY}&cmd=pms_image_proxy&rating_key=${ratingKey}&width=300&height=450`);
    } else {
      resp = await fetch(jfImageUrl(itemId));
    }
    if (!resp.ok) return res.status(resp.status).end();
    const contentType = resp.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    resp.body.pipe(res);
  } catch (err) {
    console.error('Poster proxy error:', err.message);
    res.status(500).end();
  }
});

module.exports = router;
