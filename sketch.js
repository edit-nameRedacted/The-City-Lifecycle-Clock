// sketch.js — draws the city clock and drives the simulation from the time. (Version 2)
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
  afternoon: 7,        // 12:00 — these two are for the HUD's label only, and follow the clock:
  slowing: 12,         // 17:00   Morning to 12:00, Afternoon to 17:00, Late afternoon to 19:00
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
const TIDE_BANDS = 14;               // how many bands of the two blues lie between the river and the city's edge
const LIGHT = { spacing: 3.2, size: 2.6, base: 0.45, boost: 0.3 };   // map px, and opacities

const TIP = [226, 132, 48];  // the glowing tip of a street being drawn, and a street's afterglow
const TIP_PX = 3;            // screen px: radius of the tip's bright dot
const AFTERGLOW_MS = 1200;   // a street that just finished glows this long
const ROAD_MS = 9000;        // how long a widening takes to travel the length of its road
const SNAP_MS = 700;         // a street that snaps onto a junction swells over the gap and settles
const CAM_EASE = 0.01;       // how quickly the camera moves toward its target each frame
const CAM_MARGIN = 1.1;      // breathing room around what the camera frames
const CAM_MIN = 60;          // map px: the closest view (half its smaller side), for the first minutes of the day
const CATCHUP_MS = 25;       // most time per frame spent keeping up with the clock…
const CATCHUP_FAST_MS = 250; // …and when more than a minute behind (clock mode, first load)
const SAVE_KEY = 'cityclock';
const LOAD_SHOW_AFTER = 60;  // s of catching up needed before the load screen shows
const LOAD_MS = 180;         // ms of each frame spent catching up behind the load screen
const LOAD_FADE_MS = 1200;   // how long the load screen takes to fade onto the city

const INK = [58, 38, 24];                 // street colour
const BLOCK = [232, 214, 176, 128];       // beige at 50% opacity
// Reading the time (see also the squares, below):
const BLOCK_QUARTER = [150, 104, 62, 150];      // every 15th block of an hour: a shade deeper (quarter past, half past, quarter to)
const BLOCK_NOW = [246, 190, 116, 150];         // the hour being built: warm, until the hour ends…
const BLOCK_NOW_QUARTER = [206, 112, 52, 185];  // …and its quarter blocks
const GREEN = [124, 158, 98, 150];               // a hub's square: open green (a soft tint, so it reads as green on sand too) — no outline, no mark
const NOW_FADE = 120;                           // s of city time for a finished hour's blocks to cool to beige
const GEOMETRY = { MAP_W, MAP_H, SECTIONS, HOURS, CITY_CENTER, RIVER, BRIDGE, RIVER_BUFFER, ZONES };
const H = 3600, CYCLE = 24 * H;

let mapImg, sim, seed;
let cycleStart;                           // clock mode: when the current city started (05:00)
let demoTime = 0, paused = false;         // demo mode: seconds since the current city started
let lastSave = '';
// The load screen: covers the page while the city is rebuilt up to the current time.
// null = not showing; { fadeFrom } once caught up and fading out.
let loading = null;
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
  beginLoadingIfFarBehind();
}
// Show the load screen if the city needs rebuilding up to now (a first visit, or a demo
// started partway through the day). A reload that resumes from a save usually doesn't.
function beginLoadingIfFarBehind() {
  loading = simTarget(cycleSeconds()) - sim.time > LOAD_SHOW_AFTER ? { from: sim.time, fadeFrom: null } : null;
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
    // (The simulation runs at clock speed from 05:00, so the save must not be ahead of now.)
    if (saved && saved.seed === seed && saved.time <= (now - cycleStart) / 1000) sim = CitySim.restore(saved.state || localStorage.getItem(SAVE_KEY + ':state'), GEOMETRY);
  } catch (e) { sim = null; }
  if (!sim) sim = new CitySim({ seed, geometry: GEOMETRY });
  resetNight();
}
function startDemo(fixedSeed, from = 0) {
  demoTime = from;
  seed = fixedSeed || 'demo-' + Math.floor(Math.random() * 1e6);
  sim = new CitySim({ seed, geometry: GEOMETRY });
  resetNight();
  if (typeof loading !== 'undefined' && sim && width) beginLoadingIfFarBehind();
}
// Save (clock mode only) every SAVE_EVERY of city time, and whenever dusk finishes.
const SAVE_EVERY = 15 * 60;
function maybeSave() {
  if (MODE !== 'clock') return;
  const tag = Math.floor(sim.time / SAVE_EVERY) + ':' + !!sim.finished + ':' + !!sim.duskDone;
  if (tag === lastSave) return;
  lastSave = tag;
  try {
    const state = sim.snapshot();                       // up to ~3 MB by evening
    localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY + ':state');   // free the old save first: storage is ~5 MB
    localStorage.setItem(SAVE_KEY + ':state', state);   // (kept apart, so it isn't escaped a second time)
    localStorage.setItem(SAVE_KEY, JSON.stringify({ seed, time: sim.time }));
  }
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
    if (loading && !loading.fadeFrom) demoTime -= (deltaTime / 1000) * DEMO_SPEED;   // the demo waits for it
  } else if (Date.now() - cycleStart >= CYCLE * 1000) {
    startClockDay(new Date());
  }
  const t = cycleSeconds();
  const target = simTarget(t);

  const covered = loading && !loading.fadeFrom;
  const budget = covered ? LOAD_MS : MODE === 'clock' && target - sim.time > 60 ? CATCHUP_FAST_MS : CATCHUP_MS;
  const t0 = performance.now();
  while (sim.time < target - 1e-6 && performance.now() - t0 < budget) {
    sim.advanceTo(Math.min(target, Math.floor(sim.time) + 1));
    maybeSave();
  }
  const catchingUp = target - sim.time > 2;

  if (covered) {
    // Behind the load screen nothing else is drawn, so nearly all the time goes to catching up.
    if (!catchingUp) {                                  // caught up: frame the city and fade out
      const f = framing(t); cam.x = f.x; cam.y = f.y; cam.r = f.r;
      loading.fadeFrom = millis();
    } else { drawLoading(t, target, 1); return; }
  }
  updateCamera(t);
  drawWorld(t);
  drawHud(t, catchingUp, target);
  if (loading && loading.fadeFrom) {
    const k = (millis() - loading.fadeFrom) / LOAD_FADE_MS;
    if (k >= 1) loading = null;
    else drawLoading(t, target, 1 - smooth(k));
  }
}

// ── The load screen ────────────────────────────────────────
// A plain card in the time of day's colours: the day replaying toward now, and how far it's got.
function drawLoading(t, target, alpha) {
  const night = !['morning', 'afternoon', 'late'].includes(phaseOf(t));
  const bg = night ? NIGHT : [236, 226, 204], ink = night ? [238, 226, 200] : [58, 38, 24];
  const accent = night ? [255, 210, 130] : TIP;
  const a = 255 * alpha;
  noStroke(); fill(...bg, a); rect(0, 0, width, height);
  const pad = n => String(Math.floor(n)).padStart(2, '0');
  const clockAt = s => { s = ((s + DAY.start * H) % CYCLE + CYCLE) % CYCLE; return `${pad(s / 3600)}:${pad(s / 60 % 60)}`; };
  const from = loading ? loading.from : 0;
  const p = constrain((sim.time - from) / Math.max(1, target - from), 0, 1);
  const cx = width / 2, cy = height / 2, w = min(420, width * 0.7);
  textAlign(CENTER, CENTER); textFont('Georgia');
  fill(...ink, a); textSize(min(30, width / 16));
  text(sim.time < sim.growEnd ? "Building today's city" : "Building today's city, and its evening", cx, cy - 58);
  // the day, replaying: from 05:00 (or the save) toward now
  fill(...ink, a * 0.75); textSize(16);
  text(`${clockAt(sim.time)}  of  ${clockAt(Math.min(target, sim.duskEnd))}`, cx, cy - 18);
  // the bar
  fill(...ink, a * 0.18); rect(cx - w / 2, cy + 12, w, 4, 2);
  fill(...accent, a); rect(cx - w / 2, cy + 12, w * p, 4, 2);
  // a glowing tip on the bar, like the streets' tips
  fill(...accent, a * 0.35); circle(cx - w / 2 + w * p, cy + 14, 16);
  fill(...accent, a); circle(cx - w / 2 + w * p, cy + 14, 7);
  fill(...ink, a * 0.55); textSize(13);
  text('The city grows from 05:00; this catches it up to the present.', cx, cy + 50);
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
// Frame the city as it stands: every street built so far and the ones being drawn, and nothing
// beyond them. (Finished streets are measured once per section; the growing ones every frame.)
let extent = null;
function cityExtent() {
  if (!extent || extent.sim !== sim || extent.version !== sim.frozenVersion) {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const e of sim.edges.values()) if (e.frozen) for (const p of e.pts) { b.x0 = min(b.x0, p.x); b.y0 = min(b.y0, p.y); b.x1 = max(b.x1, p.x); b.y1 = max(b.y1, p.y); }
    extent = { sim, version: sim.frozenVersion, box: b };
  }
  const b = Object.assign({}, extent.box);
  const add = p => { b.x0 = min(b.x0, p.x); b.y0 = min(b.y0, p.y); b.x1 = max(b.x1, p.x); b.y1 = max(b.y1, p.y); };
  for (const e of sim.edges.values()) if (!e.frozen && e.state !== 'FADING') for (const p of e.pts) add(p);
  for (const g of sim.growing) add(g.pts[g.pts.length - 1]);
  return b;
}
function framing(t) {
  // Halfway through dawn, once the city is gone, head back to the market for the next day.
  const home = t !== undefined && t / H >= DAY.tideEnd + 0.5;        // 04:30
  let b = home ? null : cityExtent();
  if (!b || !isFinite(b.x0)) b = { x0: CITY_CENTER.x, y0: CITY_CENTER.y, x1: CITY_CENTER.x, y1: CITY_CENTER.y };
  // A margin round the city — but none past the map's edge, so a city that has reached the edge
  // isn't shown smaller just to frame blank paper.
  const aspect = width / height, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const hw = max(CAM_MIN, (b.x1 - b.x0) / 2 * CAM_MARGIN), hh = max(CAM_MIN, (b.y1 - b.y0) / 2 * CAM_MARGIN);
  const x0 = max(MAP_LEFT, cx - hw), x1 = min(MAP_W, cx + hw), y0 = max(0, cy - hh), y1 = min(MAP_H, cy + hh);
  const halfW = (x1 - x0) / 2, halfH = (y1 - y0) / 2;
  const r = aspect >= 1 ? max(halfH, halfW / aspect) : max(halfW, halfH * aspect);
  return keepOnMap({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, r });
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
  noStroke();
  // The hour being built is warm; when it ends its blocks cool to the paper tone over NOW_FADE
  // seconds (the finished ones are already in the map layer underneath, in the paper tone).
  const growing = !sim.finished, prev = sim.stage > 0 ? sim.schedule[sim.stage - (growing ? 1 : 0)] : null;
  const cooling = prev ? 1 - (sim.time - (growing ? sim.st.start : sim.growEnd)) / NOW_FADE : 0;
  const shade = (b, c, k) => { fill(c[0], c[1], c[2], c[3] * k * blockFade(b)); for (const ring of blockRings(b)) { beginShape(); for (const p of ring) vertex(p.x, p.y); endShape(CLOSE); } };
  for (const b of sim.blocks) {
    if (b.sub) continue;                                          // (a sub-block is already shaded)
    // ground closed off inside a finished section this hour: plain paper tone (it isn't one of the hour's blocks)
    if (b.sid === 'seam') { if (b.of === sim.sid && growing) shade(b, BLOCK, 1); continue; }
    if (cooling > 0 && prev && b.sid === prev.id && b.sid !== sim.sid) { shade(b, b.q ? BLOCK_NOW_QUARTER : BLOCK_NOW, smooth(cooling)); continue; }
    if (b.sid !== sim.sid || sim.duskDone) continue;
    shade(b, growing ? (b.q ? BLOCK_NOW_QUARTER : BLOCK_NOW) : BLOCK, 1);
  }
  // The growing hour's square: open green, a little larger than the blocks round it (finished
  // hours' squares are in the map layer).
  if (growing) for (const q of sim.squares || []) if (q.sid === sim.sid && q.pts) { fill(...GREEN); beginShape(); for (const p of q.pts) vertex(p.x, p.y); endShape(CLOSE); }
  noFill();
  for (const ev of sim.events) {
    const age = sim.time - ev.t;
    if (age >= 5 || age < 0) continue;
    const k = 1 - age / 5;
    if (ev.type === 'block') {
      stroke(150, 90, 40, 220 * k); strokeWeight(2.2 * k + 0.3);
      for (const ring of blockRings(ev.block)) { beginShape(); for (const p of ring) vertex(p.x, p.y); endShape(CLOSE); }
    }
  }
  strokeCap(ROUND); strokeJoin(ROUND); noFill();
  for (const e of sim.edges.values()) {
    if (e.frozen) continue;
    const a = (e.state === 'FADING' ? max(0, e.alpha) : e.state === 'PROVISIONAL' ? 0.75 : 1) * edgeFadeOf(e);
    stroke(INK[0], INK[1], INK[2], 255 * a);
    strokeWeight(e.width);
    if (drawSnap(e)) continue;
    beginShape(); for (const p of e.pts) vertex(p.x, p.y); endShape();
  }
  // A main road widening: a glowing tip travels its length, the new width following behind.
  for (const ev of sim.events) {
    if (ev.type !== 'road' || !ev.path) continue;
    if (ev.seen === undefined) ev.seen = sim.time - ev.t < 5 ? millis() : -Infinity;
    const k = (millis() - ev.seen) / ROAD_MS;
    if (k < 0 || k >= 1.25) continue;
    const along = pathUpTo(ev.path, Math.min(1, k));
    const fade = k > 1 ? 1 - (k - 1) / 0.25 : 1;
    noFill(); strokeCap(ROUND); strokeJoin(ROUND);
    stroke(INK[0], INK[1], INK[2], 255 * fade); strokeWeight(ev.width);          // the new width
    beginShape(); for (const p of along) vertex(p.x, p.y); endShape();
    stroke(...TIP, 120 * fade); strokeWeight(ev.width + 2 / camScale());          // a warm edge on it
    beginShape(); for (const p of along) vertex(p.x, p.y); endShape();
    if (k < 1) {
      const tip = along[along.length - 1], u = 1 / camScale();
      noStroke(); fill(...TIP, 70); circle(tip.x, tip.y, 2 * TIP_PX * 3 * u);
      fill(...TIP, 235); circle(tip.x, tip.y, 2 * TIP_PX * 1.3 * u);
    }
  }
  // Streets being drawn right now: the line so far, and a glowing tip where it's growing.
  stroke(INK[0], INK[1], INK[2], 190);
  for (const b of sim.growing) {
    strokeWeight(b.bridge ? 1.6 : CFG.WIDTH0);
    beginShape(); for (const p of b.pts) vertex(p.x, p.y); endShape();
  }
  const u = 1 / camScale();                           // one screen pixel, in map pixels
  noStroke();
  for (const b of sim.growing) {
    const tip = b.pts[b.pts.length - 1];
    fill(...TIP, 70); circle(tip.x, tip.y, 2 * (TIP_PX * 2.6) * u);     // soft halo
    fill(...TIP, 235); circle(tip.x, tip.y, 2 * TIP_PX * u);            // bright centre
  }
  // Streets that just finished glow briefly along their length.
  noFill(); strokeCap(ROUND);
  const now = millis();
  for (const e of sim.edges.values()) {
    if (e.frozen) continue;
    if (e.glow === undefined) e.glow = sim.time - e.born < 2 ? now : -Infinity;   // not ones from catch-up
    const k = 1 - (now - e.glow) / AFTERGLOW_MS;
    if (k <= 0) continue;
    stroke(...TIP, 200 * k); strokeWeight(e.width + 2.5 * k * u * 2);
    beginShape(); for (const p of e.pts) vertex(p.x, p.y); endShape();
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
// (Version 2 thins the city toward its edge in the simulation; nothing fades in drawing.)
function blockFade() { return 1; }
function edgeFadeOf() { return 1; }
// A block is one enclosed area, plus any neighbouring small ones it took in.
function blockRings(b) { return b.extra && b.extra.length ? [b.pts, ...b.extra] : [b.pts]; }
function drawFrozen(ctx) {
  const tone = c => `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
  for (const b of sim.blocks) {
    if ((b.sid === sim.sid && !sim.duskDone) || b.sub || (b.sid === 'seam' && b.of === sim.sid && !sim.finished)) continue;
    ctx.fillStyle = tone(b.q ? BLOCK_QUARTER : BLOCK);
    ctx.globalAlpha = blockFade(b);
    for (const ring of blockRings(b)) { ctx.beginPath(); ring.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); }
  }
  ctx.globalAlpha = 1; ctx.fillStyle = tone(GREEN);                 // the squares, under the streets
  for (const q of sim.squares || []) {
    if (!q.pts || (q.sid === sim.sid && !sim.finished)) continue;
    ctx.beginPath(); q.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = `rgb(${INK.join(',')})`; ctx.lineCap = 'round';
  for (const e of sim.edges.values()) {
    if (!e.frozen) continue;
    ctx.globalAlpha = edgeFadeOf(e);
    ctx.lineWidth = e.width;
    ctx.beginPath(); ctx.moveTo(e.pts[0].x, e.pts[0].y);
    for (let i = 1; i < e.pts.length; i++) ctx.lineTo(e.pts[i].x, e.pts[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Night: the lights ──────────────────────────────────────
// Every street becomes a line of small blurred warm dots. The night goes through the day's hours
// in order and at the day's pace (the day, 05:00–21:00, replayed between DAY.lightsStart and
// lightsEnd), but within each hour's section the lights no longer retrace how it was built: they
// start at one place and spread outward along the streets —
//   · at the section's hub, if it has one (every odd hour does);
//   · otherwise on its main road, at the end nearest where the last section's lights were thickest;
//   · or, with no main road, at the street nearest that thickest place.
// Main roads carry the light faster than side streets, so they light first and it spreads off them.
// When all the streets round a block that was filled in the day are lit, they brighten.
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
const LIGHT_ROAD_SPEED = 3.5;   // how much faster light runs along a main road than a side street
const LIGHT_SLOT = 0.94;        // the share of an hour's slot its streets take to light (the rest: all lit)
// Everything the lights will draw, in the order it happens.
function buildLightEvents() {
  const active = [...sim.edges.values()].filter(e => sim.isActive(e));
  const ends = e => [e.pts[0], e.pts[e.pts.length - 1]];
  const lenOf = e => { const [a, b] = ends(e); return dist(a.x, a.y, b.x, b.y); };
  // Which streets border each block (a point just either side of each street's middle), for the
  // brightening — and so that "thickest lights" counts it.
  const boxes = sim.blocks.map(b => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of b.ring) { x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y); }
    return { b, x0, y0, x1, y1, edges: [] };
  });
  const bordering = new Map();
  for (const e of active) {
    const [a, b] = ends(e), L = lenOf(e) || 1;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nx = -(b.y - a.y) / L * 1.5, ny = (b.x - a.x) / L * 1.5;
    for (const side of [1, -1]) {
      const p = { x: m.x + nx * side, y: m.y + ny * side };
      for (const bx of boxes) {
        if (p.x < bx.x0 || p.x > bx.x1 || p.y < bx.y0 || p.y > bx.y1) continue;
        if (pointInRing(p, bx.b.ring)) { bx.edges.push(e.id); bordering.set(e.id, (bordering.get(e.id) || 0) + 1); break; }
      }
    }
  }
  const events = [], dotsOf = new Map(), litAt = new Map();      // edge id → its dots; → when its last dot lights
  const bySection = new Map();
  for (const e of active) { if (!bySection.has(e.sid)) bySection.set(e.sid, []); bySection.get(e.sid).push(e); }
  // Light spreading from one junction over the street network: the distance to every junction
  // (Dijkstra), main roads counting as shorter.
  const cost = e => lenOf(e) / (e.arterial ? LIGHT_ROAD_SPEED : 1);
  const spread = (from, wanted) => {
    const d = new Map([[from, 0]]), heap = [[0, from]], done = new Set();
    let left = wanted.size;
    const push = x => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[i][0] <= heap[c][0]) break; [heap[i], heap[c]] = [heap[c], heap[i]]; i = c; } } return top; };
    while (heap.length && left > 0) {
      const [dn, id] = pop(); if (done.has(id)) continue; done.add(id);
      if (wanted.has(id)) left--;
      const n = sim.nodes.get(id); if (!n) continue;
      for (const eid of n.edges) {
        const e = sim.edges.get(eid); if (!e || !sim.isActive(e)) continue;
        const o = e.a === id ? e.b : e.a, nd = dn + cost(e);
        if (!done.has(o) && (!d.has(o) || nd < d.get(o))) { d.set(o, nd); push([nd, o]); }
      }
    }
    return d;
  };
  let thickest = null, before = null;                             // where the last section's lights were densest, and the one before
  const starts = [];                                              // (where each section's lights begin — for checking)
  for (const st of sim.schedule) {
    const own = bySection.get(st.id); if (!own || !own.length) continue;
    const nodeIds = new Set(); for (const e of own) { nodeIds.add(e.a); nodeIds.add(e.b); }
    const nearest = (ids, p) => { let best = null, bd = Infinity; for (const id of ids) { const n = sim.nodes.get(id); if (!n) continue; const dd = (n.x - p.x) ** 2 + (n.y - p.y) ** 2; if (dd < bd) { bd = dd; best = id; } } return best; };
    // where the lights start
    const sq = (sim.squares || []).find(q => q.sid === st.id && q.c), hub = sq ? sq.c : (sim.squareAt || {})[st.id];
    let from, kind = 'hub';
    if (hub) from = nearest(nodeIds, hub);
    else {
      const roadIds = new Set(); for (const e of own) if (e.arterial) { roadIds.add(e.a); roadIds.add(e.b); }
      // (if the last section was across the river, the one before it is the neighbour to continue from)
      const ids = roadIds.size ? roadIds : nodeIds, gap = p => { const n = sim.nodes.get(nearest(ids, p)); return n ? dist(n.x, n.y, p.x, p.y) : Infinity; };
      if (thickest && before && gap(before) < 0.5 * gap(thickest)) thickest = before;
      from = nearest(ids, thickest || CITY_CENTER);
      kind = roadIds.size ? 'main road' : 'street';
    }
    if (from === null) continue;
    const d = spread(from, nodeIds), src = sim.nodes.get(from);
    starts.push({ sid: st.id, kind, x: src.x, y: src.y, toward: hub ? null : thickest });
    let far = 0; for (const id of nodeIds) if (d.has(id)) far = max(far, d.get(id));
    const reach = id => { if (d.has(id)) return d.get(id); const n = sim.nodes.get(id); return far + (n ? dist(n.x, n.y, src.x, src.y) : 0); };   // (a street cut off from the rest: after everything else)
    // every dot of every street, with how far the light travels to reach it
    const all = [];
    for (const e of own) {
      const [a, b] = ends(e), L = lenOf(e), n = Math.max(1, Math.floor(L / LIGHT.spacing)), k = e.arterial ? 1 / LIGHT_ROAD_SPEED : 1;
      const da = reach(e.a), db = reach(e.b), list = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, p = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
        list.push(p); all.push({ p, e, d: Math.min(da + f * L * k, db + (1 - f) * L * k) });
      }
      dotsOf.set(e.id, list);
    }
    all.sort((u, v) => u.d - v.d);
    // …lit at an even pace through the hour's slot, a few at a time
    const span = (st.end - st.start) * LIGHT_SLOT, step = Math.max(1, Math.ceil(all.length / 600));
    for (let i = 0; i < all.length; i += step) {
      const t = st.start + span * i / all.length, group = all.slice(i, i + step);
      events.push({ t, dots: group.map(u => u.p), a: LIGHT.base });
      for (const u of group) litAt.set(u.e.id, Math.max(litAt.get(u.e.id) || 0, t));
    }
    // where this section's lights are thickest (brightened streets count more)
    const cell = 60, tally = new Map();
    for (const u of all) { const key = Math.floor(u.p.x / cell) + ',' + Math.floor(u.p.y / cell); tally.set(key, (tally.get(key) || 0) + LIGHT.base + LIGHT.boost * (bordering.get(u.e.id) || 0)); }
    let top = null;
    for (const [key, v] of tally) {
      const [i, j] = key.split(',').map(Number); let sum = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) sum += tally.get((i + di) + ',' + (j + dj)) || 0;
      if (!top || sum > top.sum) top = { sum, x: (i + 0.5) * cell, y: (j + 0.5) * cell };
    }
    if (top) { before = thickest; thickest = top; }
  }
  // dusk's own streets (spurs past the edge, the embankment): as they were built
  for (const e of active) {
    if (dotsOf.has(e.id)) continue;
    const [a, b] = ends(e), n = Math.max(1, Math.floor(lenOf(e) / LIGHT.spacing)), list = [];
    for (let i = 0; i <= n; i++) list.push({ x: lerp(a.x, b.x, i / n), y: lerp(a.y, b.y, i / n) });
    dotsOf.set(e.id, list); litAt.set(e.id, e.born);
    events.push({ t: e.born, dots: list, a: LIGHT.base });
  }
  // the streets round a filled block brighten once they are all lit
  for (const bx of boxes) if (bx.edges.length) {
    let t = 0; for (const id of bx.edges) t = Math.max(t, litAt.get(id) || 0);
    events.push({ t: t + 1, dots: bx.edges.flatMap(id => dotsOf.get(id) || []), a: LIGHT.boost });
  }
  events.sort((p, q) => p.t - q.t);
  events.starts = starts;
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
// The river rises. zones.js holds when the water reaches each 4 px cell: fastest over the
// floodplain, then free land, slowly into resistance land, never onto high ground. Bands of the
// river's two blues move outward with the front, so they follow the river's shape. Beyond the
// water the night overlay darkens to black-blue, so by 04:00 nothing else shows.
let flood = null;
function drawTide(t) {
  const ph = phaseOf(t);
  const tp = 250 * (ph === 'dawn' ? 1 : smooth(tideProgress(t)) * 0.15 + tideProgress(t) * 0.85);
  const a = ph === 'dawn' ? 1 - smooth((t / H - DAY.tideEnd) * 2) : 1;      // fades by 04:30
  if (a <= 0 || tp <= 0) return;
  if (!flood) {
    const b = atob(ZONES.flood), arr = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
    const cv = document.createElement('canvas'); cv.width = ZONES.w; cv.height = ZONES.h;
    flood = { arr, cv, ctx: cv.getContext('2d'), img: null, tp: -1, a: -1 };
    flood.img = flood.ctx.createImageData(ZONES.w, ZONES.h);
  }
  if (Math.abs(tp - flood.tp) >= 0.25 || Math.abs(a - flood.a) > 0.01) {     // redraw only when it has moved
    const d = flood.img.data, arr = flood.arr, bandQ = 250 / TIDE_BANDS, A = Math.round(255 * a);
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i], o = 4 * i;
      if (q === 255 || q > tp) { d[o + 3] = 0; continue; }
      const c = TIDE_BLUES[Math.floor((tp - q) / bandQ) % 2];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = A;
    }
    flood.ctx.putImageData(flood.img, 0, 0); flood.tp = tp; flood.a = a;
  }
  drawingContext.save();
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.drawImage(flood.cv, 0, 0, ZONES.w * ZONES.cell, ZONES.h * ZONES.cell);
  drawingContext.restore();
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
// The first share k (0–1) of a path's length, as points.
function pathUpTo(path, k) {
  let total = 0; for (let i = 1; i < path.length; i++) total += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
  let left = total * k; const out = [path[0]];
  for (let i = 1; i < path.length && left > 0; i++) {
    const L = dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
    if (L <= left) { out.push(path[i]); left -= L; }
    else { out.push(lerpPt(path[i - 1], path[i], left / L)); left = 0; }
  }
  return out;
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
