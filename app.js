// EcoVision — live planetary dashboard. No build step, no API keys.
const $ = s => document.querySelector(s), D = Math.PI / 180;
const cv = $('#globe'), cx = cv.getContext('2d'), card = $('#card');
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---------- panels ---------- */
const rows = a => a.map(([l, k, b]) => `<div class="r"><span>${l}</span><b data-k="${k}">…</b>${b ? `<i data-b="${k}"></i>` : ''}</div>`).join('');
const panel = (t, h) => `<div class="p"><h3>// ${t}</h3>${h}</div>`;
const tile = (t, k, s) => `<div class="p t"><h3>${t}</h3><div class="big" data-k="${k}">…</div><div class="sub" data-k="${s}"></div></div>`;
$('#L').innerHTML =
  panel('SATELLITE NETWORK', rows([['Tracking', 'trk'], ['Altitude', 'ia'], ['Velocity', 'iv'], ['Signal', 'sig'], ['Latency', 'lat']])) +
  panel('DATA FEEDS', rows([['Climate API', 'f_climate'], ['Open-Meteo', 'f_meteo'], ['USGS', 'f_usgs'], ['NASA EONET', 'f_eonet'], ['ISS tracker', 'f_iss']])) +
  panel('CARBON TRACKER', `<div class="big" data-k="gt">37.4 Gt</div><div class="sub">CO₂ annual emissions · 2024 ref</div>` + rows([['This year (est.)', 'ytd'], ['Rate', 'rate']]));
$('#R').innerHTML =
  panel('CLIMATE OVERVIEW', rows([['Global temp', 'temp', 1], ['Sea level', 'sea', 1], ['Arctic ice vs avg', 'ice', 1], ['Extreme events', 'ev', 1]])) +
  panel('ATMOSPHERE DATA', `<div class="sub">CO₂ concentration</div><div class="big" data-k="co2">…</div>` + rows([['CH₄ methane', 'ch4'], ['N₂O nitrous', 'n2o'], ['CO₂ growth /yr', 'co2g']])) +
  panel('ACTIVE EVENTS', rows([['Wildfires', 'wf'], ['Severe storms', 'sv'], ['Cyclone signals', 'cy'], ['Quakes M4.5+ 24h', 'qn'], ['Hottest sample', 'hot'], ['Coldest sample', 'cold']]));
$('#S').innerHTML = tile('SURFACE TEMP (30-PT MEAN)', 'st', 'sts') + tile('GLOBAL HUMIDITY', 'sh', 'shs') + tile('SOLAR AT GROUND', 'ss', 'sss') + tile('STRONGEST QUAKE 24H', 'qmax', 'qplace');
set('trk', 'ISS (ZARYA)'); set('sea', '+3.4 mm/yr', 68); set('sts', '▲ live'); set('shs', '▲ live'); set('sss', '▲ live');
['climate', 'meteo', 'usgs', 'eonet', 'iss'].forEach(k => set('f_' + k, 'SYNCING'));
document.querySelectorAll('.p').forEach((e, i) => e.style.transitionDelay = 0.8 + i * 0.12 + 's');
setTimeout(() => document.body.classList.add('on'), 100);

function set(k, v, p) {
  document.querySelectorAll(`[data-k="${k}"]`).forEach(e => { e.textContent = v; e.classList.toggle('bad', v === 'OFFLINE'); });
  if (p != null) document.querySelectorAll(`[data-b="${k}"]`).forEach(e => e.style.width = Math.max(4, Math.min(100, p)) + '%');
}

/* ---------- live data ---------- */
const live = { quakes: [], events: [], iss: null };
async function get(u, ms = 9000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw 0; return await r.json(); } finally { clearTimeout(t); }
}
const feed = async (k, fn) => { try { await fn(); set('f_' + k, 'ONLINE'); } catch { set('f_' + k, 'OFFLINE'); } };
const sgn = v => (v > 0 ? '+' : '') + v;

const climate = () => feed('climate', async () => {
  const g = p => get('https://global-warming.org/api/' + p);
  const r = await Promise.allSettled([g('co2-api'), g('methane-api'), g('nitrous-oxide-api'), g('temperature-api'), g('arctic-api')]);
  if (r.every(x => x.status !== 'fulfilled')) throw 0;
  const [c, m, n, t, a] = r.map(x => x.value), last = x => x[x.length - 1];
  try { const d = c.co2.filter(x => +x.cycle > 300), l = last(d), p = d.find(x => +x.year == l.year - 1 && x.month == l.month && x.day == l.day);
    set('co2', (+l.cycle).toFixed(1) + ' ppm'); set('co2g', p ? sgn((l.cycle - p.cycle).toFixed(2)) + ' ppm' : '—'); } catch {}
  try { set('ch4', Math.round(last(m.methane).average) + ' ppb'); } catch {}
  try { set('n2o', (+last(n.nitrous).average).toFixed(1) + ' ppb'); } catch {}
  try { const v = +last(t.result).station; set('temp', sgn(v.toFixed(2)) + '°C', v / 2 * 100); } catch {}
  try { const d = a.arcticData.data, e = d[Object.keys(d).pop()], p = e.anom / e.monthlyMean * 100; set('ice', sgn(p.toFixed(1)) + '%', Math.abs(p) * 5); } catch {}
});
const sample = () => feed('meteo', async () => {
  const P = [...Array(30)].map((_, i) => [Math.asin(1 - 2 * (i + .5) / 30) / D, (i * 137.508) % 360 - 180]);
  const j = await get(`https://api.open-meteo.com/v1/forecast?latitude=${P.map(p => p[0].toFixed(2))}&longitude=${P.map(p => p[1].toFixed(2))}&current=temperature_2m,relative_humidity_2m,shortwave_radiation`);
  const c = j.map(x => x.current), av = k => c.reduce((s, x) => s + x[k], 0) / c.length;
  set('st', av('temperature_2m').toFixed(1) + '°C'); set('sh', av('relative_humidity_2m').toFixed(1) + '%'); set('ss', Math.round(av('shortwave_radiation')) + ' W/m²');
});
const quakes = () => feed('usgs', async () => {
  const f = (await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson')).features;
  live.quakes = f.map(q => ({ la: q.geometry.coordinates[1] * D, lo: q.geometry.coordinates[0] * D, m: q.properties.mag }));
  const s = [...f].sort((a, b) => b.properties.mag - a.properties.mag)[0];
  set('qn', f.length); set('qmax', s ? 'M' + s.properties.mag.toFixed(1) : '—'); set('qplace', s ? s.properties.place : '');
});
const eonet = () => feed('eonet', async () => {
  const j = await get('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=300'), n = {}; live.events = [];
  live.storms = []; live.fires = [];
  j.events.forEach(e => { const c = e.categories[0].id; n[c] = (n[c] || 0) + 1; const g = e.geometry[e.geometry.length - 1]; if (c === 'severeStorms') live.storms.push(e.title);
    if ((c === 'wildfires' || c === 'volcanoes') && g && g.type === 'Point') live.fires.push({ la: g.coordinates[1] * D, lo: g.coordinates[0] * D, v: c === 'volcanoes' });
    if (g && g.type === 'Point') live.events.push({ la: g.coordinates[1] * D, lo: g.coordinates[0] * D }); });
  set('wf', n.wildfires || 0); set('sv', n.severeStorms || 0); alertUI(); set('ev', j.events.length + ' open', j.events.length / 2.5);
});
async function iss() {
  try { const t0 = performance.now(), j = await get('https://api.wheretheiss.at/v1/satellites/25544', 5000);
    live.iss = { la: j.latitude * D, lo: j.longitude * D };
    set('ia', Math.round(j.altitude) + ' km'); set('iv', Math.round(j.velocity).toLocaleString() + ' km/h');
    set('lat', Math.round(performance.now() - t0) + ' ms'); set('sig', '● STABLE'); set('f_iss', 'ONLINE');
  } catch { set('sig', '● LOST'); set('f_iss', 'OFFLINE'); }
}
const every = (fn, ms) => { fn(); setInterval(fn, ms); };
every(climate, 6 * 36e5); every(sample, 5 * 6e4); every(quakes, 5 * 6e4); every(eonet, 5 * 6e4); every(iss, 5000);

setInterval(() => {
  const n = new Date(), y0 = Date.UTC(n.getUTCFullYear(), 0, 1), y1 = Date.UTC(n.getUTCFullYear() + 1, 0, 1);
  $('#utc').textContent = n.toISOString().slice(0, 19).replace('T', '  ') + ' UTC';
  set('ytd', Math.round(37.4e9 * (n - y0) / (y1 - y0)).toLocaleString() + ' t');
  set('rate', Math.round(37.4e9 / ((y1 - y0) / 1000)).toLocaleString() + ' t/s');
}, 1000);

/* ---------- land mask + dot globe ---------- */
let mask = null, dots = [], sea = [];
function rings(t) {
  const [sx, sy] = t.transform.scale, [tx, ty] = t.transform.translate;
  const arcs = t.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
  const ring = r => { const o = []; r.forEach(i => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; o.push(...(o.length ? a.slice(1) : a)); }); return o; };
  const out = [], walk = g => { if (g.geometries) g.geometries.forEach(walk);
    else if (g.type == 'Polygon') g.arcs.forEach(r => out.push(ring(r)));
    else if (g.type == 'MultiPolygon') g.arcs.forEach(p => p.forEach(r => out.push(ring(r)))); };
  Object.values(t.objects).forEach(walk); return out;
}
const isLand = (la, lo) => mask && mask[((Math.min(719, Math.max(0, Math.floor((90 - la) * 4))) * 1440 + Math.min(1439, Math.floor((lo + 180) * 4))) * 4) + 3] > 0;
function build(rs) {
  dots = []; sea = [];
  const c = document.createElement('canvas'); c.width = 1440; c.height = 720; const g = c.getContext('2d'); g.beginPath();
  rs.forEach(r => { r.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo']((x + 180) * 4, (90 - y) * 4)); g.closePath(); });
  g.fillStyle = '#fff'; g.fill('evenodd'); mask = g.getImageData(0, 0, 1440, 720).data;
  for (let la = -88.5; la < 90; la += 1.5) { const n = Math.round(360 * Math.cos(la * D) / 1.5);
    for (let i = 0; i < n; i++) { const lo = -180 + (i + .5) * 360 / n; if (isLand(la, lo)) dots.push([la * D, lo * D, Math.sin(la * D), Math.cos(la * D), 0, -1, -1]); } }
  for (let la = -87; la < 90; la += 3) { const n = Math.round(360 * Math.cos(la * D) / 3);
    for (let i = 0; i < n; i++) { const lo = -180 + (i + .5) * 360 / n; if (!isLand(la, lo)) sea.push([la * D, lo * D, Math.sin(la * D), Math.cos(la * D), 0, -1]); } }
  tint();
}
(async () => {
  for (const u of ['data/land-110m.json', 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json', 'https://unpkg.com/world-atlas@2/land-110m.json'])
    try { const r = await fetch(u); if (r.ok) { build(rings(await r.json())); return; } } catch {}
})();

/* ---------- render ---------- */
let w, h, R, CX, CY, dpr, yaw = 80 * D, pitch = 20 * D, vy = 0, vp = 0, en = 1, drag = null, marker = null, mode = 'thermal', G = null, TG = null, tors = [], ext = [], warns = [], fly = null, hov = null;
const stars = Array.from({ length: 900 }, () => { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u), r = 1.15 + Math.random() * 2;
  return { x: s * Math.cos(a) * r, y: u * r, z: s * Math.sin(a) * r, j: [Math.random() - .5, Math.random() - .5] }; });
const grid = [];
for (let la = -60; la <= 60; la += 30) { const l = []; for (let lo = -180; lo <= 180; lo += 3) l.push([la * D, lo * D]); grid.push(l); }
for (let lo = -180; lo < 180; lo += 30) { const l = []; for (let la = -90; la <= 90; la += 3) l.push([la * D, lo * D]); grid.push(l); }

/* ---------- thermal layer + cyclone early warning (Open-Meteo, 10° global scan) ---------- */
const COL = [...Array.from({ length: 48 }, (_, i) => `hsl(${250 - i / 47 * 250},85%,58%)`), '#ffd23c', '#ff9a1f', '#ff4a2a', '#e0309a'];
const LATS = [...Array(17)].map((_, i) => -80 + i * 10), LONS = [...Array(36)].map((_, i) => -180 + i * 10);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
function interp(la, lo) {
  const fi = cl((la + 80) / 10, 0, 16), i = Math.min(15, Math.floor(fi)), fj = ((lo + 180) / 10 + 36) % 36, j = Math.floor(fj), j2 = (j + 1) % 36, u = fi - i, v = fj - j, T = G.T, at = (a, b) => T[a * 36 + b];
  return at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v) + at(i, j2) * (1 - u) * v + at(i + 1, j2) * u * v;
}
function tint() {
  const key = (x, y) => Math.round(x / D / 4) * 4 + ',' + Math.round(y / D / 4) * 4;
  if (G) for (const d of [...dots, ...sea]) d[5] = Math.round(cl((interp(d[0] / D, d[1] / D) + 30) / 75, 0, 1) * 47);
  if (TG) for (const d of dots) { const p = TG.get(key(d[0], d[1])), ix = p ? p[2] : 0; d[6] = ix >= 70 ? 51 : ix >= 50 ? 50 : ix >= 30 ? 49 : ix >= 15 ? 48 : -1; }
}
const mx = a => Math.max(...a.filter(v => v != null)), mn = a => Math.min(...a.filter(v => v != null));
const batch = async (pts, q) => { const o = []; for (let i = 0; i < pts.length; i += 100) { const c = pts.slice(i, i + 100);
  o.push(get(`https://api.open-meteo.com/v1/forecast?latitude=${c.map(p => p[0])}&longitude=${c.map(p => p[1])}&${q}${q.includes('wind_speed_unit') ? '' : '&wind_speed_unit=kmh'}&timezone=UTC`, 25000)); }
  return (await Promise.all(o)).flatMap(j => Array.isArray(j) ? j : [j]); };
async function refine(flag) {   // zoom into the strongest coarse signals on a 1.5° grid
  flag.sort((a, b) => b.g - a.g); const top = [];
  for (const f of flag) if (top.length < 3 && top.every(c => Math.hypot(c.la - f.la, (c.lo - f.lo) * Math.cos(f.la * D)) > 25)) top.push(f);
  const out = [];
  for (const c of top) { const pts = []; for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) pts.push([+(c.la + i * 1.5).toFixed(2), +((c.lo + j * 1.5 + 540) % 360 - 180).toFixed(2)]);
    const r = await batch(pts, 'hourly=wind_gusts_10m,pressure_msl&forecast_days=5'); let best = null, pm = 9999;
    r.forEach((x, i) => x.hourly.wind_gusts_10m.forEach((g, k) => { const p = x.hourly.pressure_msl[k]; if (g == null || p == null) return; pm = Math.min(pm, p);
      if (!best || g > best.g) best = { la: pts[i][0], lo: pts[i][1], g, t: x.hourly.time[k] }; }));
    if (best && best.g >= 90 && pm <= 1000 && !(isLand(best.la, best.lo) && best.g < 130)) out.push({ ...best, p: pm }); }
  return out;
}
async function scan() {
  try {
    let s = null; try { s = JSON.parse(localStorage.getItem('ev_scan')); } catch {}
    if (!s || Date.now() - s.t > 3 * 36e5) {
      const pts = LATS.flatMap(la => LONS.map(lo => [la, lo])), flag = [];
      const r = await batch(pts, 'hourly=wind_gusts_10m,pressure_msl&forecast_days=5');
      r.forEach((x, i) => { const [la, lo] = pts[i]; if (Math.abs(la) < 5 || Math.abs(la) > 35) return;
        const g = mx(x.hourly.wind_gusts_10m), p = mn(x.hourly.pressure_msl); if (g >= 70 && p <= 1004) flag.push({ la, lo, g }); });
      s = { t: Date.now(), w: await refine(flag) };
      try { localStorage.setItem('ev_scan', JSON.stringify(s)); } catch {}
    }
    warns = s.w.map(w => ({ ...w, lv: w.g >= 160 ? 'SEVERE' : w.g >= 120 ? 'WARNING' : 'WATCH' }));
    set('cy', warns.length); alertUI();
  } catch { set('cy', '—'); }
}
function alertUI() {
  const a = $('#alert'); if (!warns.length) { a.hidden = true; return; }
  const pos = w => `${Math.abs(w.la).toFixed(1)}°${w.la < 0 ? 'S' : 'N'} ${Math.abs(w.lo).toFixed(1)}°${w.lo < 0 ? 'W' : 'E'}`;
  const when = w => { const hr = Math.round((Date.parse(w.t + 'Z') - Date.now()) / 36e5); return hr > 1 ? `in ~${hr} h` : 'now'; };
  a.hidden = false;
  a.innerHTML = warns.map((w, i) => `<button data-i="${i}"><b>⚠ CYCLONE ${w.lv}</b> &nbsp;${pos(w)} · gusts ${Math.round(w.g)} km/h · ${Math.round(w.p)} hPa · peak ${when(w)}</button>`).join('') +
    `<small>Forecast-model signal, not an official warning${live.storms && live.storms.length ? ' · NASA EONET active now: ' + live.storms.slice(0, 2).join(', ') : ''}. Follow your national weather service.</small>`;
}
$('#alert').onclick = e => { const b = e.target.closest('button'); if (b) { fly = { la: warns[b.dataset.i].la * D, lo: warns[b.dataset.i].lo * D }; en = 1; } };
document.querySelector('header').classList.add('th', 'tm');
document.querySelector('header').insertAdjacentHTML('beforeend', '<div id="thinfo"></div>');
every(scan, 36e5);

// Seasonal climatology: only used for grid points the live feed couldn't supply, or if it is down entirely.
const estT = (la, lo) => { const n = new Date(), doy = (n - Date.UTC(n.getUTCFullYear(), 0, 0)) / 864e5; return 27 - .0066 * la * la + la / 90 * 14 * Math.cos(2 * Math.PI * (doy - 200) / 365); };
async function thermalScan() {
  const info = $('#thinfo'); let s = null; try { s = JSON.parse(localStorage.getItem('ev_th2')); } catch {}
  if (!s || Date.now() - s.t > 30 * 6e4) {
    const pts = LATS.flatMap(la => LONS.map(lo => [la, lo])), v = new Array(pts.length).fill(null);
    const run = async i => { const c = pts.slice(i, i + 50);
      for (let k = 0; k < 3; k++) { try { const j = await get(`https://api.open-meteo.com/v1/forecast?latitude=${c.map(p => p[0])}&longitude=${c.map(p => p[1])}&current=temperature_2m&timezone=UTC`, 15000);
        (Array.isArray(j) ? j : [j]).forEach((x, n) => { const t = x && x.current && x.current.temperature_2m; if (typeof t === 'number') v[i + n] = t; }); return; }
        catch { await new Promise(r => setTimeout(r, 800 * (k + 1))); } } };
    const starts = []; for (let i = 0; i < pts.length; i += 50) starts.push(i);
    for (let i = 0; i < starts.length; i += 3) await Promise.all(starts.slice(i, i + 3).map(run));   // 3 requests at a time: avoids rate-limit drops
    const n = v.filter(x => x != null).length;
    for (let pass = 0; pass < 6 && v.some(x => x == null); pass++) { const w = [...v];          // fill gaps from live neighbours first
      v.forEach((x, k) => { if (x != null) return; const r = Math.floor(k / 36), c = k % 36, nb = [r > 0 ? w[k - 36] : null, r < 16 ? w[k + 36] : null, w[r * 36 + (c + 35) % 36], w[r * 36 + (c + 1) % 36]].filter(y => y != null);
        if (nb.length) v[k] = nb.reduce((p, q) => p + q, 0) / nb.length; }); }
    s = { t: Date.now(), n, T: v.map((x, k) => x == null ? estT(LATS[Math.floor(k / 36)], LONS[k % 36]) : x) };
    if (n >= 500) { try { localStorage.setItem('ev_th2', JSON.stringify(s)); } catch {} } else setTimeout(thermalScan, 90000);   // retry soon if the feed was patchy
  }
  G = { T: s.T }; tint();
  set('hot', sgn(Math.round(mx(s.T))) + '°C'); set('cold', sgn(Math.round(mn(s.T))) + '°C');
  ext = s.T.map((t, i) => ({ t, la: LATS[Math.floor(i / 36)] * D, lo: LONS[i % 36] * D })).filter(e => e.t >= 40 || e.t <= -35);
  info.textContent = s.n >= 600 ? `LIVE · ${s.n}/612 POINTS` : s.n >= 60 ? `PARTIAL · ${s.n}/612 LIVE · GAPS ESTIMATED` : 'ESTIMATED · LIVE FEED UNAVAILABLE';
  console.info('[thermal] live points:', s.n, '/ 612');
}
every(thermalScan, 30 * 6e4);

/* ---------- tornado-favourability (CAPE x deep-layer shear, 3-day forecast, land 16-56° both hemispheres) ---------- */
const LV = ix => ix >= 70 ? ['EXTREME', 51] : ix >= 50 ? ['HIGH', 50] : ix >= 30 ? ['MODERATE', 49] : ['LOW', 48];
async function tscan() {
  const box = $('#tor'); box.hidden = false; box.innerHTML = '<small>Scanning forecast for tornado-favourable conditions…</small>';
  try {
    if (!mask) throw 0;
    let s = null; try { s = JSON.parse(localStorage.getItem('ev_tor')); } catch {}
    if (!s || Date.now() - s.t > 3 * 36e5) {
      const pts = []; for (const la of [-44, -40, -36, -32, -28, -24, -20, -16, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56]) for (let lo = -180; lo < 180; lo += 4) if (isLand(la, lo)) pts.push([la, lo]);
      const r = await batch(pts, 'hourly=cape,wind_speed_10m,wind_direction_10m,wind_speed_500hPa,wind_direction_500hPa&forecast_days=3&wind_speed_unit=ms');
      s = { t: Date.now(), p: r.map((x, i) => { const h = x.hourly; let b = [0, '', 0, 0];
        h.time.forEach((tm, k) => { const c = h.cape[k], s1 = h.wind_speed_10m[k], d1 = h.wind_direction_10m[k], s5 = h.wind_speed_500hPa[k], d5 = h.wind_direction_500hPa[k];
          if ([c, s1, d1, s5, d5].some(v => v == null)) return;
          const sh = Math.hypot(-s5 * Math.sin(d5 * D) + s1 * Math.sin(d1 * D), -s5 * Math.cos(d5 * D) + s1 * Math.cos(d1 * D));
          if (c < 300 || sh < 8) return; const ix = Math.round(Math.min(c / 2000, 1.5) * Math.min(sh / 20, 1.5) / 2.25 * 100);
          if (ix > b[0]) b = [ix, tm, Math.round(c), Math.round(sh)]; });
        return [pts[i][0], pts[i][1], ...b]; }) };
      try { localStorage.setItem('ev_tor', JSON.stringify(s)); } catch {}
    }
    TG = new Map(s.p.map(p => [p[0] + ',' + p[1], p])); tint(); tors = [];
    for (const p of s.p.filter(p => p[2] >= 15).sort((a, b) => b[2] - a[2])) if (tors.length < 6 && tors.every(c => Math.hypot(c[0] - p[0], (c[1] - p[1]) * Math.cos(p[0] * D)) > 10)) tors.push(p);
    await Promise.all(tors.map(async p => { try { const g = await get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p[0]}&longitude=${p[1]}&localityLanguage=en`);
      p.name = [g.principalSubdivision, g.countryName].filter(Boolean).join(', '); } catch {} }));
  } catch { TG = null; box.innerHTML = '<small>Tornado data unavailable right now (map or forecast feed offline). Try again shortly.</small>'; return; }
  torUI();
}
function torUI() {
  const b = $('#tor'); if (mode !== 'tornado') { b.hidden = true; return; } if (!TG) return; b.hidden = false;
  const when = p => { const hr = Math.round((Date.parse(p[3] + 'Z') - Date.now()) / 36e5); return hr > 1 ? `peak in ~${hr} h` : 'peak now'; };
  b.innerHTML = '<h4>TORNADO-FAVOURABLE CONDITIONS · NEXT 72 H</h4>' + (tors.length ? tors.map((p, i) => { const [n, k] = LV(p[2]);
    return `<button data-i="${i}"><b style="color:${COL[k]}">${n}</b> &nbsp;${p.name || Math.abs(p[0]) + '°' + (p[0] < 0 ? 'S' : 'N') + ' ' + Math.abs(p[1]) + '°' + (p[1] < 0 ? 'W' : 'E')} · index ${p[2]}/100 · CAPE ${p[4]} · shear ${p[5]} m/s · ${when(p)}</button>`; }).join('')
    : '<small>No tornado-favourable conditions detected over land in the next 72 h.</small>') +
    '<small>Indicative index (CAPE × wind shear, Open-Meteo model data), not a tornado forecast. Follow NOAA SPC or your national weather service.</small>';
}
$('#tor').onclick = e => { const b = e.target.closest('button'); if (b) { fly = { la: tors[b.dataset.i][0] * D, lo: tors[b.dataset.i][1] * D }; en = 1; } };
function setMode(m) {
  mode = mode === m ? 'off' : m; $('#bT').setAttribute('aria-pressed', mode === 'thermal'); $('#bK').setAttribute('aria-pressed', mode === 'tornado');
  document.querySelector('header').classList.toggle('th', mode !== 'off'); document.querySelector('header').classList.toggle('tm', mode === 'thermal');
  $('#legend').innerHTML = mode === 'tornado' ? ['LOW', 'MODERATE', 'HIGH', 'EXTREME'].map((n, i) => `<span class="sw" style="--c:${COL[48 + i]}">${n}</span>`).join('') : '<span>-30°C</span><i></i><span>45°C</span>';
  torUI(); if (mode === 'tornado' && !TG) tscan();
}
$('#bT').onclick = () => setMode('thermal'); $('#bK').onclick = () => setMode('tornado');

function size() {
  const m = innerWidth < 900; dpr = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = m ? Math.round(innerHeight * .6) : innerHeight;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
  const a = m ? h : $('#S').getBoundingClientRect().top;
  CX = w / 2; CY = m ? h / 2 : a / 2 + 8; R = Math.max(110, Math.min(m ? w * .44 : (w - 680) / 2, (a - 50) / 2) * .98);
}
addEventListener('resize', size); document.fonts.ready.then(size); size();

function frame(t) {
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
  if (!drag) { yaw += vy; pitch += vp; vy += ((RM ? 0 : .0011) - vy) * .02; vp *= .95; }
  if (fly) { let dy = fly.lo - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yaw += dy * .08; pitch += (fly.la - pitch) * .08; vy = 0; if (Math.abs(dy) < .003) fly = null; }
  pitch = Math.max(-1.45, Math.min(1.45, pitch)); en *= .965;
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const P = (la, lo) => { const d = lo - yaw, c = Math.cos(la); return [c * Math.sin(d), cp * Math.sin(la) - sp * c * Math.cos(d), sp * Math.sin(la) + cp * c * Math.cos(d)]; };
  // stars (scatter while dragging)
  const cy = Math.cos(yaw * .5), sy = Math.sin(yaw * .5), cq = Math.cos(pitch * .5), sq = Math.sin(pitch * .5);
  cx.fillStyle = '#fff'; cx.globalAlpha = .1 + .75 * en;
  for (const s of stars) { let x = s.x * cy - s.z * sy, z = s.x * sy + s.z * cy; const y = s.y * cq - z * sq; z = s.y * sq + z * cq;
    if (z < 0 && x * x + y * y < 1) continue; cx.fillRect(CX + R * x + s.j[0] * en * R * .6, CY - R * y + s.j[1] * en * R * .6, 1.2, 1.2); }
  // graticule + outline
  const F = new Path2D(), B = new Path2D();
  for (const l of grid) { let pr = null; for (const [la, lo] of l) { const p = P(la, lo);
    if (pr) { const f = pr[2] > 0 && p[2] > 0, q = f ? F : B; q.moveTo(CX + R * pr[0], CY - R * pr[1]); q.lineTo(CX + R * p[0], CY - R * p[1]); } pr = p; } }
  cx.lineWidth = 1; cx.strokeStyle = '#fff'; cx.globalAlpha = .06; cx.stroke(B); cx.globalAlpha = .2; cx.stroke(F);
  cx.beginPath(); cx.arc(CX, CY, R, 0, 7); cx.globalAlpha = .14; cx.stroke();
  // land dots: back side faint, front side brighter toward the rim
  const fr = [], th = mode === 'thermal' && G, tr = mode === 'tornado' && TG, cm = th || tr;
  cx.globalAlpha = .05;
  for (const d of dots) { const sl = d[2], cl = d[3], dd = d[1] - yaw, cd = Math.cos(dd), z = sp * sl + cp * cl * cd;
    if (z > 0) fr.push(d[1], sl, cl, z, tr ? d[6] : d[5], 1.7); else cx.fillRect(CX + R * cl * Math.sin(dd) - .6, CY - R * (cp * sl - sp * cl * cd) - .6, 1.2, 1.2); }
  if (th) for (const d of sea) { const z = sp * d[2] + cp * d[3] * Math.cos(d[1] - yaw); if (z > 0) fr.push(d[1], d[2], d[3], z, d[5], 1.1); }
  let lc = '';
  for (let i = 0; i < fr.length; i += 6) { const d = fr[i] - yaw, sl = fr[i + 1], cl = fr[i + 2], ci = fr[i + 4], hit = cm && ci >= 0, s = tr ? (hit ? 2.4 : 1.4) : fr[i + 5], c = hit ? COL[ci] : '#fff';
    if (c !== lc) cx.fillStyle = lc = c;
    cx.globalAlpha = tr ? (hit ? .95 : .22) : (hit ? .85 : .9) * (th && s < 1.5 ? .7 : 1) * (.55 + .45 * (1 - fr[i + 3])) * (hit ? 1 : .8);
    cx.fillRect(CX + R * cl * Math.sin(d) - s / 2, CY - R * (cp * sl - sp * cl * Math.cos(d)) - s / 2, s, s); }
  cx.fillStyle = '#fff';
  // live overlays
  const ph = (t % 2400) / 2400; cx.lineWidth = 1;
  for (const q of live.quakes) { const p = P(q.la, q.lo); if (p[2] <= 0) continue; const r = 2 + q.m * 1.1 + ph * 9;
    cx.globalAlpha = .75 * (1 - ph); cx.beginPath(); cx.arc(CX + R * p[0], CY - R * p[1], r, 0, 7); cx.stroke(); cx.fillRect(CX + R * p[0] - 1, CY - R * p[1] - 1, 2, 2); }
  cx.globalAlpha = .45;
  for (const e of live.events) { const p = P(e.la, e.lo); if (p[2] > 0) cx.strokeRect(CX + R * p[0] - 2, CY - R * p[1] - 2, 4, 4); }
  if (live.iss) { const p = P(live.iss.la, live.iss.lo), k = p[2] > 0 ? 1 : .25, x = CX + R * 1.06 * p[0], y = CY - R * 1.06 * p[1];
    cx.globalAlpha = k; cx.beginPath(); cx.moveTo(x - 7, y); cx.lineTo(x + 7, y); cx.moveTo(x, y - 7); cx.lineTo(x, y + 7); cx.stroke();
    cx.beginPath(); cx.arc(x, y, 2.5, 0, 7); cx.fill(); cx.font = '600 10px Rajdhani,sans-serif'; cx.fillText('ISS', x + 9, y - 6); }
  if (mode === 'thermal' && G) {
    cx.font = '600 10px Rajdhani,sans-serif'; cx.textAlign = 'center'; cx.lineWidth = 3; cx.lineJoin = 'round';
    G.T.forEach((t, i) => { const p = P(LATS[Math.floor(i / 36)] * D, LONS[i % 36] * D); if (p[2] < .28) return; const x = CX + R * p[0], y = CY - R * p[1] + 3, s = Math.round(t) + '°';
      cx.globalAlpha = .5 + .5 * p[2]; cx.strokeStyle = 'rgba(0,0,0,.85)'; cx.strokeText(s, x, y); cx.fillStyle = COL[Math.round(cl((t + 30) / 75, 0, 1) * 47)]; cx.fillText(s, x, y); });
    if (hov && !drag) { const x = (hov.x - CX) / R, y = (CY - hov.y) / R, r2 = x * x + y * y;
      if (r2 < 1) { const z = Math.sqrt(1 - r2), la = Math.asin(z * sp + y * cp) / D, lo = (yaw + Math.atan2(x, z * cp - y * sp)) / D, t = interp(la, ((lo + 540) % 360) - 180);
        cx.font = '700 14px Rajdhani,sans-serif'; cx.textAlign = 'left'; const s = `${t.toFixed(1)}°C / ${(t * 1.8 + 32).toFixed(0)}°F`;
        cx.globalAlpha = 1; cx.strokeText(s, hov.x + 14, hov.y - 10); cx.fillStyle = '#fff'; cx.fillText(s, hov.x + 14, hov.y - 10); } }
    cx.textAlign = 'left'; cx.strokeStyle = cx.fillStyle = '#fff'; cx.lineWidth = 1;
  }
  if (mode === 'thermal') {
    for (const f of live.fires || []) { const p = P(f.la, f.lo); if (p[2] <= 0) continue; const x = CX + R * p[0], y = CY - R * p[1], g = cx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, f.v ? 'rgba(255,50,50,.95)' : 'rgba(255,170,30,.95)'); g.addColorStop(1, 'rgba(255,90,0,0)');
      cx.globalAlpha = .6 + .4 * Math.sin(t / 300 + f.la * 9); cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, 9, 0, 7); cx.fill(); }
    cx.font = '700 10px Rajdhani,sans-serif';
    for (const e of ext) { const p = P(e.la, e.lo); if (p[2] <= 0) continue; const x = CX + R * p[0], y = CY - R * p[1], q = (ph + (e.la % 1)) % 1;
      cx.strokeStyle = cx.fillStyle = e.t >= 40 ? '#ff5a1a' : '#5ac8ff'; cx.lineWidth = 1.2; cx.globalAlpha = 1 - q; cx.beginPath(); cx.arc(x, y, 5 + q * 14, 0, 7); cx.stroke();
      cx.globalAlpha = .95; cx.fillText(Math.round(e.t) + '°', x + 9, y + 3); }
    cx.strokeStyle = cx.fillStyle = '#fff'; cx.lineWidth = 1;
  }
  if (mode === 'tornado') { cx.strokeStyle = '#ffb22e'; cx.lineWidth = 1.5;
    for (const p of tors) { const q = P(p[0] * D, p[1] * D); if (q[2] <= 0) continue; cx.globalAlpha = 1 - ph; cx.beginPath(); cx.arc(CX + R * q[0], CY - R * q[1], 6 + ph * 18, 0, 7); cx.stroke(); }
    cx.strokeStyle = '#fff'; cx.lineWidth = 1; }
  for (const w of warns) { const p = P(w.la * D, w.lo * D); if (p[2] <= 0) continue; const x = CX + R * p[0], y = CY - R * p[1];
    cx.strokeStyle = cx.fillStyle = '#ff5a3c'; cx.lineWidth = 1.5; for (const k of [0, .5]) { const q = (ph + k) % 1; cx.globalAlpha = 1 - q; cx.beginPath(); cx.arc(x, y, 8 + q * 22, 0, 7); cx.stroke(); }
    cx.globalAlpha = 1; cx.beginPath(); cx.arc(x, y, 3.5, 0, 7); cx.fill(); cx.font = '700 10px Rajdhani,sans-serif'; cx.fillText('CYCLONE ' + w.lv, x + 14, y + 4); cx.strokeStyle = cx.fillStyle = '#fff'; cx.lineWidth = 1; }
  if (marker) { const p = P(marker.la, marker.lo); if (p[2] > .02) { const x = CX + R * p[0], y = CY - R * p[1], X = CX + R * p[0] * 1.13, Y = CY - R * p[1] * 1.13;
    cx.globalAlpha = 1; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(X, Y); cx.stroke();
    cx.beginPath(); cx.arc(x, y, 4, 0, 7); cx.stroke(); cx.beginPath(); cx.arc(X, Y, 5, 0, 7); cx.fill(); } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- interaction ---------- */
cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, m: 0 }; fly = null; cv.classList.add('g'); };
cv.onpointerleave = () => { hov = null; };
cv.onpointermove = e => { hov = { x: e.clientX, y: e.clientY }; if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.m += Math.abs(dx) + Math.abs(dy);
  yaw -= dx / R; pitch += dy / R; vy = -dx / R; vp = dy / R; en = Math.min(1, en + (Math.abs(dx) + Math.abs(dy)) / 90); };
cv.onpointerup = e => { const click = drag && drag.m < 5; drag = null; cv.classList.remove('g'); if (click) pick(e.clientX, e.clientY); };
cv.onkeydown = e => { const k = { ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, .08], ArrowDown: [0, -.08] }[e.key]; if (k) { yaw += k[0]; pitch += k[1]; en = Math.min(1, en + .3); e.preventDefault(); } };
const hide = () => { card.hidden = true; marker = null; };
addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

let seq = 0;
const fmtPop = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? Math.round(n / 1e6) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : n;
async function pick(px, py) {
  const x = (px - CX) / R, y = (CY - py) / R, r = x * x + y * y; if (r > 1) return hide();
  const z = Math.sqrt(1 - r), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const la = Math.asin(z * sp + y * cp) / D, lo = ((yaw + Math.atan2(x, z * cp - y * sp)) / D + 540) % 360 - 180;
  marker = { la: la * D, lo: lo * D }; const id = ++seq, oc = !isLand(la, lo);
  card.hidden = false; card.className = oc ? 'o' : '';
  card.style.left = Math.max(8, Math.min(innerWidth - 300, px + 18)) + 'px'; card.style.top = Math.max(8, Math.min(innerHeight - 330, py + 18)) + 'px';
  card.innerHTML = `<div class="ch"><i></i>LOCATION MARKED<em>ESC TO CLOSE</em></div><h2 data-k="cn">${oc ? 'OPEN OCEAN' : 'LOCATING…'}</h2>` +
    (oc ? '' : rows([['CO₂ emissions', 'c_co'], ['Forest cover', 'c_fo'], ['Renewables', 'c_re'], ['Temp now', 'c_t'], ['Air quality (AQI)', 'c_a'], ['Population', 'c_po']])) +
    `<footer>${Math.abs(la).toFixed(1)}°${la < 0 ? 'S' : 'N'} ${Math.abs(lo).toFixed(1)}°${lo < 0 ? 'W' : 'E'}</footer>`;
  if (oc) return;
  const ok = f => id === seq && f();
  get(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m`).then(j => ok(() => set('c_t', j.current.temperature_2m + '°C'))).catch(() => set('c_t', '—'));
  get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${la}&longitude=${lo}&current=us_aqi`).then(j => ok(() => set('c_a', j.current.us_aqi ?? '—'))).catch(() => set('c_a', '—'));
  try {
    const g = await get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=en`); if (id !== seq) return;
    set('cn', (g.countryName || 'UNCHARTED REGION').toUpperCase().replace(/ \(.*\)/, ''));
    const wb = async i => { try { return (await get(`https://api.worldbank.org/v2/country/${g.countryCode}/indicator/${i}?format=json&mrnev=1`))[1][0].value; } catch { return null; } };
    const [co, fo, re, po] = await Promise.all(g.countryCode ? ['EN.GHG.CO2.MT.CE.AR5', 'AG.LND.FRST.ZS', 'EG.FEC.RNEW.ZS', 'SP.POP.TOTL'].map(wb) : [null, null, null, null]); if (id !== seq) return;
    set('c_co', co == null ? '—' : co >= 1000 ? (co / 1000).toFixed(2) + ' Gt/yr' : Math.round(co) + ' Mt/yr');
    set('c_fo', fo == null ? '—' : fo.toFixed(1) + '%'); set('c_re', re == null ? '—' : re.toFixed(1) + '%'); set('c_po', po == null ? '—' : fmtPop(po));
  } catch { ok(() => { set('cn', 'UNCHARTED REGION'); ['c_co', 'c_fo', 'c_re', 'c_po'].forEach(k => set(k, '—')); }); }
}
