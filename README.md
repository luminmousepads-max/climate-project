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
| Country CO₂, forest, renewables, population | World Bank + BigDataCloud (reverse geocode) |

Static reference values (marked in the UI as ref/est.): sea level +3.4 mm/yr, 37.4 Gt annual CO₂ (Global Carbon Budget 2024); the "this year" counter extrapolates that rate.

## Optional: self-host the map outline
The globe fetches land shapes from a CDN. To remove that dependency:
`curl -L -o data/land-110m.json https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json` and commit it.
