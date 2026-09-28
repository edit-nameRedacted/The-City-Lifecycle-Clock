// sketch.js — draws the city clock and drives the simulation from the time.
// Needs geometry.js and sim.js loaded first (see index.html).
//
// A day (clock times; see DAY below). The city grows one section an hour, 60 blocks a section,
// one block a minute: count the finished sections for the hour, the blocks in the growing
// one for the minute. The S-curve of growth is in the sections' sizes (see geometry.js).
//  05:00–10:00  morning: a new city starts while the night is still lifting; small sections
//  10:00–16:00  afternoon: the sections are largest; the city spreads fastest
//  16:00–19:00  late afternoon: smaller sections again; growth slows to a stop
//  19:00–21:00  dusk: a dark blue settles; streets push out past the edge; leftovers fill
//  20:00–02:00  lights: the city's growth replays as lines of small warm lights
//  02:00–03:00  night: every light on
//  03:00–04:00  the tide: rings of river blue spread from the bridge and swallow the city
//  04:00–06:00  dawn: the dark lifts through orange onto a bare landscape, and at 05:00 the
//               next city begins

// ── Mode ───────────────────────────────────────────────────
// 'clock': shows the real time. Today's city, the same on every refresh.
// 'demo':  a brand-new city on every refresh, starting at DEMO_START hours, at DEMO_SPEED.
// All can also be set in the URL, e.g. index.html?mode=demo&speed=300&start=11
const URL_ARGS = new URLSearchParams(location.search);
const MODE = URL_ARGS.get('mode') || 'clock';
let DEMO_SPEED = Number(URL_ARGS.get('speed')) || 60;   // demo only: 60 = one hour per real minute
const DEMO_SEED = URL_ARGS.get('seed') || null;         // demo only: set to replay a city you liked
const DEMO_START = URL_ARGS.has('start') ? Number(URL_ARGS.get('start')) : 5;   // demo: clock hour to start at

// The day, in hours after the city starts (DAY.start o'clock). Everything else follows from these.
const DAY = {
  start: 5,            // 05:00: a new city begins
  afternoon: 5,        // 10:00 (for the labels only: the pace is set by the sections' sizes)
  slowing: 11,         // 16:00
  growEnd: 14,         // 19:00: the last section is done; dusk begins (the simulation's dusk lasts 2 hours)
  lightsStart: 15, lightsEnd: 21,   // 20:00–02:00: the lights replay the day's growth
  endOfDay: 22,        // 03:00: the tide starts
  tideEnd: 23,         // 04:00: the tide has covered everything; dawn begins
  dawnEnd: 25,         // 06:00: the last of the night has lifted (an hour into the next city)
};
const DAWN_ALPHA = 0.55;                            // how strong the orange is at 05:00
const NIGHT = [16, 26, 58];          // the dark blue overlay
const NIGHT_ALPHA = 0.78;            // how dark it gets at dusk (it reaches 1 as the tide comes in)
const DAWN = [214, 140, 80];         // the orange it passes through at dawn
const TIDE_BLUES = [[182, 198, 204], [157, 180, 196]];   // the river's two blues, from the map
const TIDE_BAND = 40;                // map px: width of each ring of the tide
const LIGHT = { spacing: 3.2, size: 2.6, base: 0.45, boost: 0.3 };   // map px, and opacities

const SNAP_MS = 700;         // a street that snaps onto a junction swells over the gap and settles
const CAM_EASE = 0.01;       // how quickly the camera moves toward its target each frame
const CAM_MARGIN = 1.12;     // breathing room around what the camera frames
const CATCHUP_MS = 25;       // most time per frame spent keeping up with the clock…
const CATCHUP_FAST_MS = 250; // …and when more than a minute behind (clock mode, first load)
const SAVE_KEY = 'cityclock';

const INK = [58, 38, 24];                 // street colour
const BLOCK = [232, 214, 176, 128];       // beige at 50% opacity
const GEOMETRY = { MAP_W, MAP_H, SECTIONS, HOURS, CITY_CENTER, RIVER, BRIDGE, RIVER_BUFFER };
const H = 3600, CYCLE = 24 * H;
const TIDE_ORIGIN = { x: (BRIDGE.near.x + BRIDGE.far.x) / 2, y: (BRIDGE.near.y + BRIDGE.far.y) / 2 };

let mapImg, sim, seed;
let cycleStart;                           // clock mode: when the current city started (05:00)
let demoTime = 0, paused = false;         // demo mode: seconds since the current city started
let lastSave = '';
const cam = { x: CITY_CENTER.x, y: CITY_CENTER.y, r: 125 };

const MAP_FILE = 'basemap.svg';
let mapReady = false;
function preload() {
  mapImg = new Image();
  mapImg.onload = () => { mapReady = true; };
  mapImg.src = MAP_FILE;
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  if (MODE === 'demo') startDemo(DEMO_SEED, (((DEMO_START - DAY.start) % 24 + 24) % 24) * H);
  else startClockDay(new Date());
  const f = framing(cycleSeconds()); cam.x = f.x; cam.y = f.y; cam.r = f.r;
  textFont('Georgia');
}

// ── Starting a city ────────────────────────────────────────
// Clock mode: the seed is today's date, so every refresh today rebuilds the same city.
// If this browser saved today's city earlier, carry on from the save.
function startClockDay(now) {
  cycleStart = new Date(now); cycleStart.setHours(DAY.start, 0, 0, 0);
  if (cycleStart > now) cycleStart.setDate(cycleStart.getDate() - 1);   // before 05:00: yesterday's city
  const d = cycleStart;
  seed = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  sim = null;
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (saved && saved.seed === seed && saved.time <= simTarget((now - cycleStart) / 1000)) sim = CitySim.restore(saved.state, GEOMETRY);
  } catch (e) { sim = null; }
  if (!sim) sim = new CitySim({ seed, geometry: GEOMETRY });
  resetNight();
}
function startDemo(fixedSeed, from = 0) {
  demoTime = from;
  seed = fixedSeed || 'demo-' + Math.floor(Math.random() * 1e6);
  sim = new CitySim({ seed, geometry: GEOMETRY });
  resetNight();
}
// Save (clock mode only) whenever a section, or dusk, finishes.
function maybeSave() {
  if (MODE !== 'clock') return;
  const tag = sim.stage + ':' + !!sim.finished + ':' + !!sim.duskDone;
  if (tag === lastSave) return;
  lastSave = tag;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ seed, time: sim.time, state: sim.snapshot() })); }
  catch (e) { /* storage full or unavailable: reloads will just take longer */ }
}

// Seconds since the current city started.
function cycleSeconds() {
  if (MODE === 'demo') return Math.min(demoTime, CYCLE);
  return (Date.now() - cycleStart) / 1000;
}
// Where the simulation should be: it runs at clock speed from 05:00, and is still after dusk.
function simTarget(c) { return Math.min(c, sim.duskEnd); }

// ── Main loop ──────────────────────────────────────────────
function draw() {
  if (MODE === 'demo') {
    if (!paused) demoTime += (deltaTime / 1000) * DEMO_SPEED;   // speed changes never jump
    if (demoTime >= CYCLE) startDemo(null, demoTime - CYCLE);     // the cycle repeats: a new city
  } else if (Date.now() - cycleStart >= CYCLE * 1000) {
    startClockDay(new Date());
  }
  const t = cycleSeconds();
  const target = simTarget(t);

  const budget = MODE === 'clock' && target - sim.time > 60 ? CATCHUP_FAST_MS : CATCHUP_MS;
  const t0 = performance.now();
  while (sim.time < target - 1e-6 && performance.now() - t0 < budget) {
    sim.advanceTo(Math.min(target, Math.floor(sim.time) + 1));
    maybeSave();
  }
  const catchingUp = target - sim.time > 2;

  updateCamera(t);
  drawWorld(t);
  drawHud(t, catchingUp, target);
}

// ── Where in the day we are ────────────────────────────────
const smooth = x => { x = constrain(x, 0, 1); return x * x * (3 - 2 * x); };
function phaseOf(t) {
  const h = t / H;
  if (h < DAY.afternoon) return 'morning';
  if (h < DAY.slowing) return 'afternoon';
  if (h < DAY.growEnd) return 'late';
  if (h < DAY.growEnd + 2) return 'dusk';
  if (h < DAY.endOfDay) return 'night';
  if (h < DAY.tideEnd) return 'tide';
  return 'dawn';
}
// The overlay's colour and opacity at time t.
function overlayAt(t) {
  const h = t / H, ph = phaseOf(t);
  const dawnSpan = DAY.dawnEnd - DAY.tideEnd;                    // 04:00–06:00, across midnight of the cycle
  if (h < DAY.dawnEnd - 24) {                                     // 05:00–06:00: the new city's first hour
    const p = (h + 24 - DAY.tideEnd) / dawnSpan;
    return { c: DAWN, a: DAWN_ALPHA * (1 - smooth((p - 0.5) * 2)) };
  }
  if (ph === 'morning' || ph === 'afternoon' || ph === 'late') return null;
  if (ph === 'dusk') return { c: NIGHT, a: NIGHT_ALPHA * smooth((h - DAY.growEnd) / 2) };
  if (ph === 'night') return { c: NIGHT, a: NIGHT_ALPHA };
  if (ph === 'tide') return { c: NIGHT, a: lerp(NIGHT_ALPHA, 1, smooth(tideProgress(t))) };
  const p = (h - DAY.tideEnd) / dawnSpan;                         // 04:00–05:00: blue → orange
  return { c: NIGHT.map((v, i) => lerp(v, DAWN[i], smooth(p * 2))), a: lerp(1, DAWN_ALPHA, smooth(p * 2)) };
}
function tideProgress(t) { return constrain((t / H - DAY.endOfDay) / (DAY.tideEnd - DAY.endOfDay), 0, 1); }

// ── Camera ─────────────────────────────────────────────────
// Frame every section grown so far (the whole city at night).
function framing(t) {
  // Halfway through dawn, once the city is gone, head back to the centre for the next day.
  const home = t !== undefined && t / H >= DAY.tideEnd + 0.5;        // 04:30
  const last = home ? 0 : Math.min(sim.stage, sim.schedule.length - 1);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k <= last; k++) {
    for (const poly of SECTIONS[sim.schedule[k].id].poly) for (const [x, y] of poly) {
      x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y);
    }
  }
  const aspect = width / height;
  const halfW = (x1 - x0) / 2, halfH = (y1 - y0) / 2;
  const r = aspect >= 1 ? max(halfH, halfW / aspect) : max(halfW, halfH * aspect);
  return keepOnMap({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: r * CAM_MARGIN });
}
// Slide the view so it doesn't show past the map's edges (or the blank strip down its left side).
const MAP_LEFT = 22;
function keepOnMap(f) {
  const s = min(width, height) / (2 * f.r), halfW = width / 2 / s, halfH = height / 2 / s;
  const fit = (c, half, lo, hi) => (hi - lo < 2 * half) ? (lo + hi) / 2 : constrain(c, lo + half, hi - half);
  return { x: fit(f.x, halfW, MAP_LEFT, MAP_W), y: fit(f.y, halfH, 0, MAP_H), r: f.r };
}
function updateCamera(t) {
  const f = framing(t);
  cam.x += (f.x - cam.x) * CAM_EASE; cam.y += (f.y - cam.y) * CAM_EASE; cam.r += (f.r - cam.r) * CAM_EASE;
}
function camScale() { return min(width, height) / (2 * cam.r); }
function viewRect() {
  const halfW = width / 2 / camScale(), halfH = height / 2 / camScale();
  return { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH };
}

// ── Drawing ────────────────────────────────────────────────
function drawWorld(t) {
  background(236, 226, 204);
  const ph = phaseOf(t);
  const showCity = ph !== 'dawn';                     // 04:00–05:00: the old city is gone
  push();
  translate(width / 2, height / 2);
  scale(camScale());
  translate(-cam.x, -cam.y);                          // from here on, draw in map pixels

  drawMap(showCity);                                  // the map, plus every finished section
  if (showCity) drawLiveCity();

  const ov = overlayAt(t);
  const v = viewRect();
  if (ov && ov.a > 0) { noStroke(); fill(...ov.c, 255 * ov.a); rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0); }
  if (t >= DAY.lightsStart * H && ph !== 'dawn') drawLights(t, 1 - smooth(tideProgress(t)));
  if (ph === 'tide' || ph === 'dawn') drawTide(t);
  pop();
}

// The section growing now (or dusk's additions): its blocks, pulses, streets.
function drawLiveCity() {
  noStroke(); fill(...BLOCK);
  for (const b of sim.blocks) {
    if (b.sid !== sim.sid || sim.duskDone) continue;
    for (const ring of blockRings(b)) { beginShape(); for (const p of ring) vertex(p.x, p.y); endShape(CLOSE); }
  }
  noFill();
  for (const ev of sim.events) {
    const age = sim.time - ev.t;
    if (age >= 5 || age < 0) continue;
    const k = 1 - age / 5;
    if (ev.type === 'block') {
      stroke(150, 90, 40, 220 * k); strokeWeight(2.2 * k + 0.3);
      for (const ring of blockRings(ev.block)) { beginShape(); for (const p of ring) vertex(p.x, p.y); endShape(CLOSE); }
    } else if (ev.type === 'road') {
      stroke(150, 90, 40, 200 * k); strokeWeight(3.5 * k + 0.5);
      for (const id of ev.ids) { const e = sim.edges.get(id); if (e) line(e.pts[0].x, e.pts[0].y, e.pts[1].x, e.pts[1].y); }
    }
  }
  strokeCap(ROUND); strokeJoin(ROUND); noFill();
  for (const e of sim.edges.values()) {
    if (e.frozen) continue;
    const a = e.state === 'FADING' ? max(0, e.alpha) : e.state === 'PROVISIONAL' ? 0.75 : 1;
    stroke(INK[0], INK[1], INK[2], 255 * a);
    strokeWeight(e.width);
    if (drawSnap(e)) continue;
    beginShape(); for (const p of e.pts) vertex(p.x, p.y); endShape();
  }
  stroke(INK[0], INK[1], INK[2], 190);
  for (const b of sim.growing) {
    strokeWeight(b.bridge ? 1.6 : CFG.WIDTH0);
    beginShape(); for (const p of b.pts) vertex(p.x, p.y); endShape();
  }
}

// ── Base map and finished sections ─────────────────────────
// The SVG map and every finished street and block go into one off-screen canvas covering the
// visible area (plus a margin) at the current zoom. It's redrawn only when the zoom changes
// by a few percent, the view moves outside it, a section finishes, or the city is hidden.
let mapCache = null;
function drawMap(showCity) {
  if (!mapReady) return;
  const s = camScale() * pixelDensity();
  const v = viewRect(), halfW = (v.x1 - v.x0) / 2, halfH = (v.y1 - v.y0) / 2;
  const c = mapCache;
  const version = showCity ? sim.frozenVersion : -1;
  const stale = !c || Math.abs(s / c.s - 1) > 0.04 || c.version !== version || c.sim !== sim ||
    v.x0 < c.x0 || v.y0 < c.y0 || v.x1 > c.x1 || v.y1 > c.y1;
  if (stale) {
    const mx = halfW * 0.3, my = halfH * 0.3;
    const r = { x0: v.x0 - mx, y0: v.y0 - my, x1: v.x1 + mx, y1: v.y1 + my, s, version, sim };
    const cv = (c && c.canvas) || document.createElement('canvas');
    cv.width = Math.ceil((r.x1 - r.x0) * s); cv.height = Math.ceil((r.y1 - r.y0) * s);
    const ctx = cv.getContext('2d');
    ctx.setTransform(s, 0, 0, s, -r.x0 * s, -r.y0 * s);
    ctx.drawImage(mapImg, 0, 0, MAP_W, MAP_H);
    if (showCity) drawFrozen(ctx);
    r.canvas = cv; mapCache = r;
  }
  const m = mapCache;
  drawingContext.drawImage(m.canvas, m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
}
// A block is one enclosed area, plus any neighbouring small ones it took in.
function blockRings(b) { return b.extra && b.extra.length ? [b.pts, ...b.extra] : [b.pts]; }
function drawFrozen(ctx) {
  ctx.fillStyle = `rgba(${BLOCK[0]},${BLOCK[1]},${BLOCK[2]},${BLOCK[3] / 255})`;
  for (const b of sim.blocks) {
    if (b.sid === sim.sid && !sim.duskDone) continue;
    for (const ring of blockRings(b)) { ctx.beginPath(); ring.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); }
  }
  ctx.strokeStyle = `rgb(${INK.join(',')})`; ctx.lineCap = 'round';
  for (const e of sim.edges.values()) {
    if (!e.frozen) continue;
    ctx.lineWidth = e.width;
    ctx.beginPath(); ctx.moveTo(e.pts[0].x, e.pts[0].y);
    for (let i = 1; i < e.pts.length; i++) ctx.lineTo(e.pts[i].x, e.pts[i].y);
    ctx.stroke();
  }
}

// ── Night: the lights ──────────────────────────────────────
// Every street becomes a line of small blurred warm dots, appearing in the order the street
// was built (the day's growth replayed between DAY.lightsStart and lightsEnd). When a block
// that street borders was filled in the day, its dots get brighter.
let lights = null;          // { events, version, canvas, x0…, s, done }
let glow = null;            // one soft dot, drawn once and stamped everywhere
function resetNight() { lights = null; }
function glowSprite() {
  if (glow) return glow;
  glow = document.createElement('canvas'); glow.width = glow.height = 32;
  const g = glow.getContext('2d'), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,246,215,1)'); grad.addColorStop(0.35, 'rgba(255,214,130,0.55)'); grad.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  return glow;
}
// Everything the lights will draw, in the order it happens.
function buildLightEvents() {
  const dotsOf = e => {
    const a = e.pts[0], b = e.pts[e.pts.length - 1], n = Math.max(1, Math.floor(dist(a.x, a.y, b.x, b.y) / LIGHT.spacing));
    const out = [];
    for (let i = 0; i <= n; i++) out.push({ x: lerp(a.x, b.x, i / n), y: lerp(a.y, b.y, i / n) });
    return out;
  };
  const events = [], dots = new Map();
  for (const e of sim.edges.values()) {
    if (!sim.isActive(e)) continue;
    const d = dotsOf(e); dots.set(e.id, d);
    events.push({ t: e.born, dots: d, a: LIGHT.base });
  }
  // Which streets border each block: test a point just either side of each street's middle.
  const boxes = sim.blocks.map(b => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of b.ring) { x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y); }
    return { b, x0, y0, x1, y1, edges: [] };
  });
  for (const e of sim.edges.values()) {
    if (!dots.has(e.id)) continue;
    const a = e.pts[0], b = e.pts[e.pts.length - 1], L = dist(a.x, a.y, b.x, b.y) || 1;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nx = -(b.y - a.y) / L * 1.5, ny = (b.x - a.x) / L * 1.5;
    for (const side of [1, -1]) {
      const p = { x: m.x + nx * side, y: m.y + ny * side };
      for (const bx of boxes) {
        if (p.x < bx.x0 || p.x > bx.x1 || p.y < bx.y0 || p.y > bx.y1) continue;
        if (pointInRing(p, bx.b.ring)) { bx.edges.push(e.id); break; }
      }
    }
  }
  for (const bx of boxes) if (bx.edges.length) {
    events.push({ t: bx.b.born, dots: bx.edges.flatMap(id => dots.get(id)), a: LIGHT.boost });
  }
  events.sort((p, q) => p.t - q.t);
  return events;
}
function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function drawLights(t, fade) {
  if (fade <= 0) return;
  const version = sim.frozenVersion + ':' + sim.edges.size;
  if (!lights || lights.version !== version || lights.sim !== sim) lights = { events: buildLightEvents(), version, sim };
  const m = mapCache; if (!m) return;
  // Rebuild the light layer whenever the map layer's area or zoom changes.
  if (!lights.canvas || lights.x0 !== m.x0 || lights.s !== m.s || lights.w !== m.canvas.width) {
    lights.canvas = lights.canvas || document.createElement('canvas');
    lights.canvas.width = m.canvas.width; lights.canvas.height = m.canvas.height;
    Object.assign(lights, { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1, s: m.s, w: m.canvas.width, done: 0 });
  }
  // How far through the day's growth the replay has got.
  const r = t >= DAY.lightsEnd * H ? Infinity
    : (t - DAY.lightsStart * H) / ((DAY.lightsEnd - DAY.lightsStart) * H) * sim.duskEnd;
  const ctx = lights.canvas.getContext('2d'), spr = glowSprite(), s = lights.s, z = LIGHT.size;
  ctx.setTransform(s, 0, 0, s, -lights.x0 * s, -lights.y0 * s);
  ctx.globalCompositeOperation = 'lighter';
  while (lights.done < lights.events.length && lights.events[lights.done].t <= r) {
    const ev = lights.events[lights.done++];
    ctx.globalAlpha = ev.a;
    for (const p of ev.dots) ctx.drawImage(spr, p.x - z, p.y - z, 2 * z, 2 * z);
  }
  drawingContext.save();
  drawingContext.globalCompositeOperation = 'lighter';
  drawingContext.globalAlpha = fade;
  drawingContext.drawImage(lights.canvas, lights.x0, lights.y0, lights.x1 - lights.x0, lights.y1 - lights.y0);
  drawingContext.restore();
}

// ── The tide ───────────────────────────────────────────────
// Rings of the river's two blues spread from the middle of the river by the bridge, growing
// until they cover the whole city. At dawn they fade away.
let tideReach = null;
function drawTide(t) {
  if (!tideReach) {
    tideReach = 0;
    for (const id in SECTIONS) for (const poly of SECTIONS[id].poly) for (const [x, y] of poly)
      tideReach = max(tideReach, dist(x, y, TIDE_ORIGIN.x, TIDE_ORIGIN.y));
    tideReach += 80;
  }
  const span = (DAY.tideEnd - DAY.endOfDay) * H;
  const reach = tideReach * Math.min(1, (t - DAY.endOfDay * H) / span);   // stops once it covers the city
  const a = phaseOf(t) === 'dawn' ? 1 - smooth((t / H - DAY.tideEnd) * 2) : 1;   // fades by 04:30
  if (a <= 0 || reach <= 0) return;
  noStroke();
  const kMax = Math.floor(reach / TIDE_BAND);
  for (let k = 0; k <= kMax; k++) {                 // largest first; each newer ring inside the last
    const r = reach - k * TIDE_BAND;
    if (r <= 0) break;
    const [cr, cg, cb] = TIDE_BLUES[k % 2];
    fill(cr, cg, cb, 255 * a);
    circle(TIDE_ORIGIN.x, TIDE_ORIGIN.y, 2 * r);
  }
}

// When a street snaps its end onto a junction, draw it as a wedge that swells from where
// its tip was until it covers the junction, then narrows onto the junction.
function drawSnap(e) {
  if (!e.snap) return false;
  if (e.snap.start === undefined) e.snap.start = sim.time - e.snap.t > 2 ? -Infinity : millis();
  const k = (millis() - e.snap.start) / SNAP_MS;
  if (k >= 1) { delete e.snap; return false; }
  const s = e.pts[0], from = e.snap.from, to = e.pts[e.pts.length - 1];
  const ease = x => x * x * (3 - 2 * x);
  let A, B;
  if (k < 0.5) { A = from; B = lerpPt(from, to, ease(k * 2)); }
  else         { A = lerpPt(from, to, ease((k - 0.5) * 2)); B = to; }
  fill(INK[0], INK[1], INK[2], 255 * (e.state === 'PROVISIONAL' ? 0.75 : 1));
  beginShape(); vertex(s.x, s.y); vertex(A.x, A.y); vertex(B.x, B.y); endShape(CLOSE);
  noFill();
  return true;
}
function lerpPt(p, q, t) { return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }

function drawHud(t, catchingUp, target) {
  const pad = n => String(Math.floor(n)).padStart(2, '0');
  const clockText = s => { s = ((s + DAY.start * H) % CYCLE + CYCLE) % CYCLE; return `${pad(s / 3600)}:${pad(s / 60 % 60)}:${pad(s % 60)}`; };
  const simText = s => `${pad(s / 3600)}:${pad(s / 60 % 60)}`;
  const st = sim.status(), ph = phaseOf(t);
  const lines = [MODE === 'demo' ? `Demo  ${clockText(t)}   ×${DEMO_SPEED}${paused ? '   paused' : ''}` : clockText(t)];
  const what = { dusk: 'Dusk', night: 'Night', tide: 'The tide', dawn: 'Dawn' }[ph];
  const when = { morning: 'Morning', afternoon: 'Afternoon', late: 'Late afternoon' }[ph];
  lines.push(what || `${when}   the ${st.id}:00 section   ${st.filled} of 60 blocks`);
  if (MODE === 'demo') lines.push(`seed ${seed}   1–6: speed   space: pause   R: new city`);
  if (catchingUp) lines.push(`catching up… growth ${simText(sim.time)} of ${simText(target)}`);
  noStroke(); fill(245, 238, 222, 215);
  rect(16, height - 24 - 22 * lines.length, 420, 16 + 22 * lines.length, 4);
  fill(58, 38, 24); textSize(15); textAlign(LEFT, TOP);
  lines.forEach((l, i) => text(l, 28, height - 16 - 22 * lines.length + i * 22));
}

// ── Controls (demo mode only) ──────────────────────────────
function keyPressed() {
  if (MODE !== 'demo') return;
  const speeds = { '1': 1, '2': 10, '3': 60, '4': 300, '5': 600, '6': 1800 };
  if (speeds[key]) DEMO_SPEED = speeds[key];
  if (key === ' ') paused = !paused;
  if (key === 'r' || key === 'R') startDemo(null);
}
function windowResized() { resizeCanvas(windowWidth, windowHeight); }
