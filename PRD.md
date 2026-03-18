# BenDash — PRD (Product Requirements Document)
**Version:** 1.0
**Date:** 2026-03-18
**Status:** Planning

---

## 1. Overview

### What
Custom homepage/dashboard replacing Homarr. Designed specifically for Ben's home infrastructure, daily browsing habits, and media consumption.

### Why
Homarr has too many features Ben doesn't use (40+ integrations, multi-user auth, LDAP) and lacks customization for his specific setup (Alfred Apps, specific API integrations, Gemini search).

### Where
- Runs on **TrueNAS** (Docker container)
- Accessible from all devices (desktop, tablet, mobile)
- URL: `https://bendash.bini541.com` (via Cloudflare Tunnel) or `http://192.168.0.13:<port>`

---

## 2. Tech Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Frontend | **Next.js 14+ (App Router)** | SSR, responsive, rich cards, great DX |
| Styling | **Tailwind CSS** | Dark theme, responsive, fast |
| State | **React Query (TanStack)** | Auto-refresh, caching, background updates |
| Backend | **Next.js API Routes** | Proxy all external APIs, keep keys server-side |
| Data | **SQLite (better-sqlite3)** | Bookmarks, stocks watchlist, layout prefs |
| Deployment | **Docker** on TrueNAS | Custom app, single container |
| Port | **7575** (same as Homarr was) | Easy migration |

---

## 3. Features & Widgets

### 3.1 🔍 Smart Search Bar (Top, Always Visible)
- Position: Top center, prominent
- Default: Google search
- Option: Toggle to Gemini search
- Keyboard shortcut: `/` or `Ctrl+K` to focus
- Shows search suggestions (optional)

### 3.2 🌤️ Weather + Clock
- Current temp + 5-day forecast
- Location: Ramla, Israel
- Clock with date
- Source: Open-Meteo API (free, no key)

### 3.3 📰 Hebits RSS Feed
- RSS URL: `https://hebits.net/feeds.php?feed=torrents_notify_1833_...` (filtered Movies)
- Rich cards: title, description, category tag, time ago
- Click to download .torrent
- Auto-refresh every 10 min
- Scrollable list, max ~20 items visible

### 3.4 📊 Stocks Ticker
- Symbols: **AKAM, ^GSPC (S&P 500), QQQ, VOO, NVDA, MSFT, GOOGL**
- Show: price, change (%), mini chart (1M)
- Source: Yahoo Finance API (free) or similar
- Auto-refresh every 15 min (market hours)
- **Easy add/remove** via UI (+ button, type symbol)

### 3.5 🔖 Bookmarks
- Grid of bookmark cards with icon + name
- Current bookmarks: One, Sport5, Facebook, iptorrents, Fuzer, Hebits, Gmail, YouTube, Photos, Geektime, TGspot, gadgety
- **Easy add/remove** via UI: + button → enter URL + name → auto-fetch favicon
- Click to open in new tab
- Optional: drag to reorder

### 3.6 🖥️ Services
- Grid of service cards with icon + name + status indicator (green/red dot)
- Services:
  | Service | URL | Health Check |
  |---------|-----|-------------|
  | Plex | http://192.168.0.13:32400 | HTTP ping |
  | Jellyfin | http://192.168.0.13:30013 | /System/Info |
  | Vaultwarden | https://bitwarden.bini541.com | HTTP ping |
  | qBittorrent | http://192.168.0.13:30024 | HTTP ping |
  | TrueNAS | http://192.168.0.13 | HTTP ping |
  | Home Assistant | http://192.168.0.130:8123 | HTTP ping |
  | AdGuard Home | http://192.168.0.68 | HTTP ping |
  | Proxmox | https://192.168.0.66:8006 | HTTP ping |
  | Kavita | http://192.168.0.13:30069 | /api/health |
  | UniFi | https://192.168.0.1 | HTTP ping |
  | ASUSTOR | http://192.168.0.191:8009 | HTTP ping |
  | Portainer | https://192.168.0.67:9443 | HTTP ping |
- Click to open in new tab
- Auto-refresh status every 30s

### 3.7 🤖 Alfred Apps (Mac mini)
- Source: Control Panel API (http://192.168.0.139:3500)
- Note: Requires auth — BenDash backend will store session cookie
- Show: App name, port, status (up/down), uptime
- **Quick actions:** Start / Stop buttons per app
- Apps:
  | App | Port |
  |-----|------|
  | Fitness App | 3000 |
  | Manor | 3100 |
  | The Board | 3200 |
  | The Chamber | 3300 |
  | Date Night App | 3400 |
  | Mission Control | 3600 |
  | Bookmarks | 3700 |
- Auto-refresh every 30s

### 3.8 💾 TrueNAS Status
- Source: TrueNAS API (`https://192.168.0.13`, API key: `1-S9knuf...`)
- **Pools:** Name, status, health, usage (free/total + progress bar)
  - Big pool (~20TB)
  - Fast pool (~450GB)
- **Apps:** Name + running/stopped status
  - n8n, mealie, jellystat, portainer, plex, frigate, qbittorrent, tautulli, open-speed-test, kavita, jellyfin
- Auto-refresh every 60s

### 3.9 ⬇️ qBittorrent Summary
- Source: qBittorrent API (`http://192.168.0.13:30024`)
- Auth: admin / alab2006
- Show:
  - Active downloads count
  - Seeding count
  - Total download speed
  - Total upload speed
  - Total downloaded (session)
- Compact card, not full torrent list

### 3.10 🎬 Media Center (Jellyfin/Plex)
- **Continue Watching** — Jellyfin API (user: bini541, ID: c11b1dd8...)
  - Show: poster, title, progress bar, resume button
- **Recently Added** — Jellystat API or Jellyfin API
  - Last 10 items added to library
  - Show: poster, title, date added
- **Currently Playing** — Tautulli API (Plex) + Jellyfin Sessions
  - Who's watching what, transcode/direct, progress
  - Source: Tautulli (`http://192.168.0.13:30047`, key: `6b03...`)
  - Source: Jellystat (`http://192.168.0.13:30176`, key: `4c6a...`)

---

## 4. Layout

### Desktop (≥1280px): 3-column grid
```
┌─────────────────────────────────────────────────┐
│                 🔍 Search Bar                    │
├─────────────────────────────────────────────────┤
│  🌤️ Weather   │      📰 Hebits RSS             │
│  + Clock       │      (scrollable feed)          │
│               │                                  │
│  📊 Stocks    │                                  │
│  (ticker row) │                                  │
├───────────────┼──────────────────────────────────┤
│  🔖 Bookmarks │  🖥️ Services    │  🤖 Alfred    │
│  (grid)       │  (grid+status)  │  Apps          │
│               │                 │  (status+acts) │
├───────────────┼─────────────────┼────────────────┤
│  💾 TrueNAS   │  ⬇️ qBit       │  🎬 Media      │
│  Status       │  Summary        │  Center        │
└───────────────┴─────────────────┴────────────────┘
```

### Tablet (768px-1279px): 2-column
### Mobile (<768px): 1-column, stacked

### Edit Mode
- Toggle edit button (top right)
- In edit mode: drag cards to reorder, resize
- Add/remove widgets
- Changes saved to SQLite

---

## 5. Design

### Theme: Dark, Rich Cards
- Background: `#0a0a0f` (near black)
- Card background: `#13131a` with subtle border `#2a2a3a`
- Card hover: slight glow/lift
- Accent color: `#6c5ce7` (purple, like Control Panel)
- Text: `#e0e0e0` (primary), `#888` (secondary)
- Status: Green `#2ecc71`, Red `#e74c3c`, Yellow `#f39c12`
- Border radius: `12-16px`
- Shadows: subtle dark shadows for depth
- Font: System font stack (-apple-system, BlinkMacSystemFont)

### Cards
- Each widget is a **rich card** with:
  - Header: icon + title + optional action button
  - Body: widget content
  - Subtle animations on load (fade in)
  - Loading skeleton while fetching
  - Error state with retry button

---

## 6. API Architecture

All external API calls go through **BenDash backend** (Next.js API routes):

```
Browser → BenDash API Routes → External Services
         /api/weather       → Open-Meteo
         /api/rss           → Hebits RSS (parse XML)
         /api/stocks        → Yahoo Finance
         /api/services      → HTTP pings to each service
         /api/alfred-apps   → Control Panel API (192.168.0.139:3500)
         /api/truenas       → TrueNAS API (192.168.0.13)
         /api/qbit          → qBittorrent API (192.168.0.13:30024)
         /api/jellyfin      → Jellyfin API (192.168.0.13:30013)
         /api/tautulli      → Tautulli API (192.168.0.13:30047)
         /api/jellystat     → Jellystat API (192.168.0.13:30176)
         /api/bookmarks     → Local SQLite
         /api/stocks/watch  → Local SQLite
         /api/layout        → Local SQLite
```

### Security
- No auth (internal network only)
- All API keys stored server-side in `.env`
- No credentials exposed to browser

---

## 7. Configuration (.env)

```env
# Core
PORT=7575
NODE_ENV=production

# Hebits RSS
HEBITS_RSS_URL=https://hebits.net/feeds.php?feed=torrents_notify_1833_d2cafff9ed2dedf1e2f54ce0912300ec&user=7205&auth=64c3b3297d42c6809f3b4378769f9388&passkey=d2cafff9ed2dedf1e2f54ce0912300ec&authkey=6f958785017ccdfab0cba2effac84cd6&name=Movies

# qBittorrent
QBIT_URL=http://192.168.0.13:30024
QBIT_USER=admin
QBIT_PASS=alab2006

# Jellyfin
JELLYFIN_URL=http://192.168.0.13:30013
JELLYFIN_API_KEY=5549e0250d7746969606ae40574cf075
JELLYFIN_USER_ID=c11b1dd8491a46578939ef6276e86b7c

# Tautulli (Plex monitoring)
TAUTULLI_URL=http://192.168.0.13:30047
TAUTULLI_API_KEY=6b03624d13de4126b260d23fb6c44c61

# Jellystat
JELLYSTAT_URL=http://192.168.0.13:30176
JELLYSTAT_API_KEY=4c6a9c54-c6c8-483d-9793-638dc6aa3dfe

# TrueNAS
TRUENAS_URL=https://192.168.0.13
TRUENAS_API_KEY=1-S9knufAO2DXDaBDldvJIee6LOw4404YfzdPTPIAMPPU12SXjdMTU5oZlJD2CCreH

# Control Panel (Alfred Apps)
CONTROL_PANEL_URL=http://192.168.0.139:3500
CONTROL_PANEL_PASS=Ofri2020!

# Weather
WEATHER_LAT=31.93
WEATHER_LON=34.87

# Stocks (comma-separated)
DEFAULT_STOCKS=AKAM,^GSPC,QQQ,VOO,NVDA,MSFT,GOOGL
```

---

## 8. Docker Deployment

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx next build
EXPOSE 7575
ENV PORT=7575
CMD ["npx", "next", "start"]
```

```yaml
# docker-compose.yml (for TrueNAS custom app)
services:
  bendash:
    build: .
    container_name: bendash
    restart: unless-stopped
    ports:
      - "7575:7575"
    volumes:
      - ./data:/app/data  # SQLite DB persistence
    env_file:
      - .env
    environment:
      - NODE_ENV=production
```

---

## 9. Refresh Intervals

| Widget | Interval | Method |
|--------|----------|--------|
| Weather | 30 min | React Query |
| Hebits RSS | 10 min | React Query |
| Stocks | 15 min (market hours) | React Query |
| Services Status | 30 sec | React Query |
| Alfred Apps | 30 sec | React Query |
| TrueNAS | 60 sec | React Query |
| qBittorrent | 30 sec | React Query |
| Media (Jellyfin) | 60 sec | React Query |
| Currently Playing | 15 sec | React Query |

---

## 10. Development Phases

### Phase 1 — Core Shell
- Next.js project setup
- Dark theme + responsive grid layout
- Search bar (Google + Gemini toggle)
- Weather + Clock widget
- Bookmarks widget (with add/remove UI)
- Services widget (with health checks)
- SQLite for bookmarks + settings

### Phase 2 — Media & Downloads
- Hebits RSS feed widget
- qBittorrent summary widget
- Jellyfin Continue Watching
- Jellyfin Recently Added
- Currently Playing (Tautulli + Jellyfin sessions)

### Phase 3 — Infrastructure
- Alfred Apps widget (status + start/stop)
- TrueNAS status widget (pools + apps)
- Stocks ticker widget (with add/remove UI)

### Phase 4 — Polish
- Edit mode (drag & reorder cards)
- Docker build + TrueNAS deployment
- Cloudflare Tunnel setup
- Performance tuning (caching, SSR)
- Import existing bookmarks from Homarr

---

## 11. APIs Verified ✅

| API | Status | Auth Method |
|-----|--------|-------------|
| qBittorrent | ✅ Working | Cookie (SID) |
| Tautulli | ✅ Working | API Key (query param) |
| Jellystat | ✅ Working | API Key (x-api-token header) |
| Jellyfin | ✅ Working | API Key (X-Emby-Token header) |
| TrueNAS | ✅ Working | API Key (Bearer token) |
| Control Panel | ✅ Working | Cookie session (password auth) |
| Hebits RSS | ✅ Working | URL params (no auth) |
| Open-Meteo | ✅ Free API | No auth |

---

## 12. Migration from Homarr

1. Export bookmarks list from Homarr
2. Import into BenDash SQLite
3. Configure Cloudflare Tunnel for `bendash.bini541.com`
4. Update browser homepage
5. Keep Homarr running in parallel for 1 week
6. Decommission Homarr
