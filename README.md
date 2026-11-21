# WEATHERXPLR · Conshohocken 19428

Local WeatherXplr board for Conshohocken / ZIP 19428 (SE-PA, PHI CWA).

## Layout
- **Left rail** — sample point, current conditions, gauges, AQI (condensed so AQI + 48h charts are fully visible)
- **Center** — dual Windy maps (radar + wind); secondary column bottom = **NWS alerts** (19428 point + SE-PA only)
- **Right rail** — 10-day forecast, temp / PoP / wind sparklines, NOAA tides, Schuylkill hydro corridor

## Features
- Dual Windy embeds (layer selectors)
- NWS alerts for **19428 + Southeastern PA** only (no NJ/DE)
- Current conditions (Open-Meteo) + 48h sparklines (temp / PoP / wind)
- Air quality (Open-Meteo) + 48h AQI / PM2.5 sparklines
- Hydro corridor — USGS Schuylkill gauges from the National Water Dashboard:
  - Reading `01471510`
  - Pottstown `01472000`
  - Norristown `01473500`
  - **Conshohocken `01473730`** (https://waterdata.usgs.gov/monitoring-location/USGS-01473730/)
  - Philadelphia `01474500`
- NOAA tides (station 8545240, Philadelphia)
- Click **WEATHERXPLR** (top left) to refresh data and recenter Windy maps on 19428

## Deploy
Static site — GitHub Pages. No worker required.

## Files
| Path | Role |
|------|------|
| `index.html` | Board UI |
| `app.js` | Feeds + dual Windy + alerts + sparks + tides + hydro |
