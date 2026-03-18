# BenDash — Deploy Guide

## Where
- **TrueNAS:** `http://192.168.0.13:7575`
- **Portainer Stack:** `bendash` on `https://192.168.0.67:9443`
- **GitHub:** `asraf-family/bendash` (private)
- **Image:** `ghcr.io/asraf-family/bendash:latest`

## Upgrade Process
1. Edit code in `~/Alfred/projects/bendash/`
2. Test locally: `node server.js` → `http://localhost:7575`
3. Commit + push: `git add -A && git commit -m "..." && git push`
4. GitHub Action builds new image (~45s)
5. Tell Ben: "עדכון מוכן, תעשה Redeploy ב-Portainer"
6. Portainer → Stacks → bendash → **Pull and redeploy**

## Local Dev
```bash
cd ~/Alfred/projects/bendash
pkill -f "node server.js" 2>/dev/null
rm -f data/bendash.db  # only if DB schema changed
node server.js
# → http://localhost:7575
```

## DB Reset
Delete `data/bendash.db` and restart — tables + seed data recreated automatically.
On TrueNAS: redeploy the stack (volume persists, but you can remove volume in Portainer to reset).
