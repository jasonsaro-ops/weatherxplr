# WEATHERXPLR · Conshohocken 19428

Local WeatherXplr board for Conshohocken / ZIP 19428 (PHI CWA).

## Features
- **Windy Dual** — side-by-side Windy embeds (radar + clouds / selectable layers)
- **NWS alerts** — point + PA / NJ / DE regional
- **Current conditions** — Open-Meteo blend at sample point + nearest station
- **Hydro corridor** — Schuylkill River USGS gauges (Reading → Fairmount Dam, including Conshohocken)
- **NOAA tides** — station 8545240 (Delaware River)
- Leaflet radar map (IEM NEXRAD, RainViewer, satellite layers)
- 7-day forecast + sparklines
- Air quality (Open-Meteo)
- KPHL status summary

Storm 3D and Visual Crossing worker integration have been removed.

## Deploy
Static site — GitHub Pages works out of the box. No worker required.

## Files
| Path | Role |
|------|------|
| `index.html` | Board UI |
| `app.js` | Data feeds + map + dual Windy |

Default sample: **40.0759, −75.2996** (Conshohocken / SE-PA).
