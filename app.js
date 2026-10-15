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
  panel('ACTIVE EVENTS', rows([['Wildfires', 'wf'], ['Severe storms', 'sv'], ['Volcanoes', 'vo'], ['Quakes M4.5+ 24h', 'qn']]));
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
  j.events.forEach(e => { const c = e.categories[0].id; n[c] = (n[c] || 0) + 1; const g = e.geometry[e.geometry.length - 1];
    if (g && g.type === 'Point') live.events.push({ la: g.coordinates[1] * D, lo: g.coordinates[0] * D }); });
  set('wf', n.wildfires || 0); set('sv', n.severeStorms || 0); set('vo', n.volcanoes || 0); set('ev', j.events.length + ' open', j.events.length / 2.5);
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
let mask = null, dots = [];
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
  const c = document.createElement('canvas'); c.width = 1440; c.height = 720; const g = c.getContext('2d'); g.beginPath();
  rs.forEach(r => { r.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo']((x + 180) * 4, (90 - y) * 4)); g.closePath(); });
  g.fillStyle = '#fff'; g.fill('evenodd'); mask = g.getImageData(0, 0, 1440, 720).data;
  for (let la = -88.5; la < 90; la += 1.5) { const n = Math.round(360 * Math.cos(la * D) / 1.5);
    for (let i = 0; i < n; i++) { const lo = -180 + (i + .5) * 360 / n; if (isLand(la, lo)) dots.push([la * D, lo * D, Math.sin(la * D), Math.cos(la * D)]); } }
}
(async () => {
  for (const u of ['data/land-110m.json', 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json', 'https://unpkg.com/world-atlas@2/land-110m.json'])
    try { const r = await fetch(u); if (r.ok) { build(rings(await r.json())); return; } } catch {}
})();

/* ---------- render ---------- */
let w, h, R, CX, CY, dpr, yaw = 80 * D, pitch = 20 * D, vy = 0, vp = 0, en = 1, drag = null, marker = null;
const stars = Array.from({ length: 900 }, () => { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u), r = 1.15 + Math.random() * 2;
  return { x: s * Math.cos(a) * r, y: u * r, z: s * Math.sin(a) * r, j: [Math.random() - .5, Math.random() - .5] }; });
const grid = [];
for (let la = -60; la <= 60; la += 30) { const l = []; for (let lo = -180; lo <= 180; lo += 3) l.push([la * D, lo * D]); grid.push(l); }
for (let lo = -180; lo < 180; lo += 30) { const l = []; for (let la = -90; la <= 90; la += 3) l.push([la * D, lo * D]); grid.push(l); }

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
  const fr = [];
  cx.globalAlpha = .05;
  for (const [la, lo, sl, cl] of dots) { const d = lo - yaw, cd = Math.cos(d), z = sp * sl + cp * cl * cd;
    if (z > 0) fr.push(la, lo, sl, cl, z); else cx.fillRect(CX + R * cl * Math.sin(d) - .6, CY - R * (cp * sl - sp * cl * cd) - .6, 1.2, 1.2); }
  for (let i = 0; i < fr.length; i += 5) { const d = fr[i + 1] - yaw, sl = fr[i + 2], cl = fr[i + 3];
    cx.globalAlpha = .3 + .6 * (1 - fr[i + 4]); cx.fillRect(CX + R * cl * Math.sin(d) - .8, CY - R * (cp * sl - sp * cl * Math.cos(d)) - .8, 1.6, 1.6); }
  // live overlays
  const ph = (t % 2400) / 2400; cx.lineWidth = 1;
  for (const q of live.quakes) { const p = P(q.la, q.lo); if (p[2] <= 0) continue; const r = 2 + q.m * 1.1 + ph * 9;
    cx.globalAlpha = .75 * (1 - ph); cx.beginPath(); cx.arc(CX + R * p[0], CY - R * p[1], r, 0, 7); cx.stroke(); cx.fillRect(CX + R * p[0] - 1, CY - R * p[1] - 1, 2, 2); }
  cx.globalAlpha = .45;
  for (const e of live.events) { const p = P(e.la, e.lo); if (p[2] > 0) cx.strokeRect(CX + R * p[0] - 2, CY - R * p[1] - 2, 4, 4); }
  if (live.iss) { const p = P(live.iss.la, live.iss.lo), k = p[2] > 0 ? 1 : .25, x = CX + R * 1.06 * p[0], y = CY - R * 1.06 * p[1];
    cx.globalAlpha = k; cx.beginPath(); cx.moveTo(x - 7, y); cx.lineTo(x + 7, y); cx.moveTo(x, y - 7); cx.lineTo(x, y + 7); cx.stroke();
    cx.beginPath(); cx.arc(x, y, 2.5, 0, 7); cx.fill(); cx.font = '600 10px Rajdhani,sans-serif'; cx.fillText('ISS', x + 9, y - 6); }
  if (marker) { const p = P(marker.la, marker.lo); if (p[2] > .02) { const x = CX + R * p[0], y = CY - R * p[1], X = CX + R * p[0] * 1.13, Y = CY - R * p[1] * 1.13;
    cx.globalAlpha = 1; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(X, Y); cx.stroke();
    cx.beginPath(); cx.arc(x, y, 4, 0, 7); cx.stroke(); cx.beginPath(); cx.arc(X, Y, 5, 0, 7); cx.fill(); } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- interaction ---------- */
cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, m: 0 }; cv.classList.add('g'); };
cv.onpointermove = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.m += Math.abs(dx) + Math.abs(dy);
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
