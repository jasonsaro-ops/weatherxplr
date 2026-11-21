# WEATHERXPLR · Conshohocken 19428

Local WeatherXplr board for Conshohocken / ZIP 19428 (SE-PA, PHI CWA).

## Layout
- **Left rail** — current conditions, gauges, AQI
- **Center** — dual Windy maps (radar + clouds); secondary column bottom = **NWS alerts** (19428 point + SE-PA only)
- **Right rail** — 7-day forecast, sparklines, NOAA tides, Schuylkill hydro corridor

## Features
- Dual Windy embeds (layer selectors)
- NWS alerts for **19428 + Southeastern PA** only (no NJ/DE)
- Current conditions (Open-Meteo)
- Hydro corridor (USGS Schuylkill gauges)
- NOAA tides (8545240)
- Click **WEATHERXPLR** (top left) to refresh data and recenter Windy maps on 19428

## Deploy
Static site — GitHub Pages. No worker required.

## Files
| Path | Role |
|------|------|
| `index.html` | Board UI |
| `app.js` | Feeds + dual Windy + alerts |
