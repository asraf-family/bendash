const express = require('express');
const router = express.Router();
const fetch = globalThis.fetch || require('node-fetch');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 min

router.get('/', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
      return res.json(cache.data);
    }

    const lat = process.env.WEATHER_LAT || '31.93';
    const lon = process.env.WEATHER_LON || '34.87';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max&timezone=Asia/Jerusalem&forecast_days=5`;

    const resp = await fetch(url);
    const data = await resp.json();

    const result = {
      current: {
        temp: data.current.temperature_2m,
        feelsLike: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        windSpeed: data.current.wind_speed_10m,
        weatherCode: data.current.weather_code,
        precipitation: data.current.precipitation,
        uvIndex: data.current.uv_index,
      },
      daily: data.daily.time.map((date, i) => ({
        date,
        maxTemp: data.daily.temperature_2m_max[i],
        minTemp: data.daily.temperature_2m_min[i],
        weatherCode: data.daily.weather_code[i],
        precipProbability: data.daily.precipitation_probability_max[i],
        precipSum: data.daily.precipitation_sum[i],
        uvIndexMax: data.daily.uv_index_max[i],
      })),
    };

    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Weather API error:', err.message);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

module.exports = router;
