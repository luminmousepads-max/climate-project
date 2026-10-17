# EcoVision — Planetary Climate Monitor

A static, no-build site: an interactive dot-matrix globe plus a live climate dashboard.
Drag to rotate · click the globe to inspect a place · `Esc` closes the card.

## Deploy: GitHub → Vercel
1. Create an empty repo on github.com, then in this folder:
   ```bash
   git init && git add . && git commit -m "EcoVision" && git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git && git push -u origin main
   ```
2. On vercel.com choose **Add New → Project**, import the repo, leave every build setting empty (Framework: *Other*) and press **Deploy**.

Run locally: `npx serve .` (any static server works; don't open index.html via `file://`).

## Live data (all free, no API keys)
| Panel | Source |
|---|---|
| CO₂, CH₄, N₂O, global temp anomaly, Arctic ice | global-warming.org (NOAA/NASA data) |
| Surface temp, humidity, solar (30-point global mean), local temp + AQI | Open-Meteo |
| Quakes, strongest quake, pulsing rings on the globe | USGS |
| Wildfires, storms, volcanoes, open events | NASA EONET |
| ISS position, altitude, velocity | wheretheiss.at |
| Thermal layer (10° global temperature grid, tints the globe) + cyclone scan | Open-Meteo forecast (cached 3 h in the browser) |
| Country CO₂, forest, renewables, population | World Bank + BigDataCloud (reverse geocode) |

Static reference values (marked in the UI as ref/est.): sea level +3.4 mm/yr, 37.4 Gt annual CO₂ (Global Carbon Budget 2024); the "this year" counter extrapolates that rate.

## Optional: self-host the map outline
The globe fetches land shapes from a CDN. To remove that dependency:
`curl -L -o data/land-110m.json https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json` and commit it.

## Thermal layer & cyclone warning
- **THERMAL LAYER** (button, top centre) tints land and ocean with current 2 m air temperature from a 10° global grid (refreshed every 30 min), prints the temperature at each grid point on the visible side of the globe, shows °C/°F under your cursor, and highlights real heat sources worldwide: glowing orange wildfires and red volcanoes (NASA EONET) plus pulsing rings on the hottest (≥40°C) and coldest (≤-35°C) spots.
- **TORNADO RISK** (button) scans a 4° land grid between 16° and 56° latitude (both hemispheres) for the next 72 h and scores each cell 0-100 from CAPE × deep-layer wind shear (10 m vs 500 hPa). Land is coloured LOW / MODERATE / HIGH / EXTREME and the top regions are listed with place names; click one to fly there. Data loads only when you press the button (≈550 Open-Meteo requests, cached 3 h). It's an indicator of favourable conditions, not a tornado forecast.
- **Cyclone warning** scans the 5-day wind-gust and pressure forecast on that grid in the tropics (5–35° latitude). Strong signals are re-checked on a finer 1.5° grid; a banner appears, the storm pulses on the globe, and clicking the banner flies to it.
  This is a coarse model-based *signal*, not an official warning. It can miss small storms and should always point users to their national weather service.

## 3D Earth model
The globe is the glTF model in `models/earth/` rendered with Three.js (loaded from the jsDelivr CDN via the import map in `index.html`). It is aligned to latitude/longitude, so clicks, the ISS, quakes, fires, cyclone and tornado markers all land in the right place. Thermal and tornado colours are painted as a transparent layer over it. If the model or Three.js can't load, the site falls back to the original dot globe automatically.
Credit (CC BY 4.0, shown in the page footer): “Earth” by Akshat — https://sketchfab.com/3d-models/earth-41fc80d85dfd480281f21b74b2de2faa
To use another Earth model, replace the files in `models/earth/` and recompute the `FIX` rotation in `app.js`.
