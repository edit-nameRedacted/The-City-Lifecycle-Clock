// workbench.js — builds geometry.js from the base map, one step at a time.
// Keys 1–9 show each step's result; E exports geometry_built.js.

// ═══════════════════════════════════════════════════════════
// Step 1: the map, and where the mouse is on it
// ═══════════════════════════════════════════════════════════
const MAP_W = 2454, MAP_H = 1728;      // every coordinate below is in these map pixels
const MAP_FILE = 'basemap.svg';

let mapImg, mapReady = false;
let step = 1;
let view;                               // { s, ox, oy }: map → screen
const BAR = 58;                         // height of the text bar at the top

function preload() {
  mapImg = new Image();                 // a plain browser image, so the SVG stays sharp
  mapImg.onload = () => { mapReady = true; };
  mapImg.src = MAP_FILE;
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('Georgia');
}

function draw() {
  background(236, 226, 204);
  // Fit the whole map in the window.
  const s = min(width / MAP_W, (height - BAR) / MAP_H);
  view = { s, ox: (width - MAP_W * s) / 2, oy: BAR + (height - BAR - MAP_H * s) / 2 };
  push();
  translate(view.ox, view.oy); scale(view.s);        // draw in map pixels from here on
  if (mapReady) drawingContext.drawImage(mapImg, 0, 0, MAP_W, MAP_H);
  drawStep();
  pop();
  drawHud();
}

// Screen position → map position.
function mouseMap() { return { x: (mouseX - view.ox) / view.s, y: (mouseY - view.oy) / view.s }; }

function drawHud() {
  const m = mouseMap();
  const r = dist(m.x, m.y, CITY_CENTER.x, CITY_CENTER.y);
  const a = (degrees(atan2(m.y - CITY_CENTER.y, m.x - CITY_CENTER.x)) + 360) % 360;
  noStroke(); fill(245, 238, 222, 230); rect(0, 0, width, BAR);
  fill(58, 38, 24); textSize(14); textAlign(LEFT, CENTER);
  text(`Step ${step}: ${STEP_NAMES[step]}`, 14, 18);
  text(INFO[step] || '', 14, 40);                  // what this step found
  textAlign(RIGHT, CENTER);
  text(`x ${m.x.toFixed(0)}  y ${m.y.toFixed(0)}   r ${r.toFixed(0)}  angle ${a.toFixed(1)}°`, width - 14, 18);
  text('keys 1–9: steps   E: export', width - 14, 40);
  if (busy) { textAlign(CENTER, CENTER); textSize(22); text('working…', width / 2, height / 2); }
}

const STEP_NAMES = {
  1: 'the map', 2: 'rings', 3: 'sections by angle', 4: 'blue pixels',
  5: 'clean river mask', 6: 'river outline', 7: 'near and far banks',
  8: 'section regions', 9: 'section outlines and bridge',
};

function keyPressed() {
  if (key >= '1' && key <= '9') { step = Number(key); prepare(step); }
  if (key === 'e' || key === 'E') exportGeometry();
}

// Each step's drawing. Later steps draw on top of what earlier steps computed.
function drawStep() {
  if (step >= 2 && step <= 3) drawRings();
  if (step === 3) drawDividers();
  if (step === 4 && R.blueImg) image(R.blueImg, 0, 0);
  if (step === 5 && R.riverImg) image(R.riverImg, 0, 0);
  if (step === 6 && R.river) drawRiverOutline();
  if (step === 7 && R.bankImg) { image(R.bankImg, 0, 0); drawRiverOutline(); }
  if (step === 8 && R.sectionImg) { image(R.sectionImg, 0, 0); drawLabels(); }
  if (step === 9 && R.polys) { drawSectionOutlines(); drawRiverOutline(); drawBridge(); drawLabels(); }
}

// ═══════════════════════════════════════════════════════════
// Step 2: rings (measured by hand from the annotated sketch)
// ═══════════════════════════════════════════════════════════
const CITY_CENTER = { x: 696, y: 715 };
const RING_R = [110, 220, 376, 590, 900];   // outer radius of rings 1–5
const FAR_INNER_R = 420;                    // 4.5 reaches this far inland; 11 starts here
const FAR_OUTER_R = 530;                    // outer limit of 11 (the merged 11/12)

function drawRings() {
  noFill(); stroke(40, 20, 10); strokeWeight(3);
  for (const r of RING_R) circle(CITY_CENTER.x, CITY_CENTER.y, 2 * r);
  stroke(40, 20, 10, 120); strokeWeight(2);
  for (const r of [FAR_INNER_R, FAR_OUTER_R]) circle(CITY_CENTER.x, CITY_CENTER.y, 2 * r);
}

// ═══════════════════════════════════════════════════════════
// Step 3: sections by angle. Angles are degrees clockwise from east
// (y points down), and a sector runs clockwise from a0 to a1.
// ═══════════════════════════════════════════════════════════
const SECTION_RULES = [   // id, bank, inner radius, outer radius, a0, a1
  ['1',   'near', 0,           RING_R[0],   0,     360],
  ['2NE', 'near', RING_R[0],   RING_R[1],   225,   45],
  ['2SW', 'near', RING_R[0],   RING_R[1],   45,    225],
  ['3',   'near', RING_R[1],   RING_R[2],   289.1, 43.3],
  ['4',   'near', RING_R[1],   RING_R[2],   43.3,  289.1],
  ['4.5', 'far',  0,           FAR_INNER_R, 161.3, 302.7],
  ['5',   'near', RING_R[2],   RING_R[3],   327.9, 36.8],
  ['6',   'near', RING_R[2],   RING_R[3],   36.8,  111.2],
  ['7',   'near', RING_R[3],   RING_R[4],   69.2,  98.5],
  ['8',   'near', RING_R[3],   RING_R[4],   40.0,  69.2],
  ['9',   'near', RING_R[3],   RING_R[4],   6.0,   40.0],
  ['10',  'near', RING_R[3],   RING_R[4],   330.9, 6.0],
  ['11',  'far',  FAR_INNER_R, FAR_OUTER_R, 161.3, 302.7],
];
const PALETTE = [[230,90,60],[240,160,50],[250,210,60],[120,190,90],[60,160,170],[90,110,210],
                 [170,90,200],[220,90,150],[200,120,80],[150,170,60],[80,190,140],[70,140,220],[190,80,110]];

// Is the angle a (degrees) inside the sector a0 → a1?
function inSector(a, a0, a1) {
  if (a0 === 0 && a1 === 360) return true;
  return a0 > a1 ? (a >= a0 || a < a1) : (a >= a0 && a < a1);
}
function atAngle(a, r) {
  return { x: CITY_CENTER.x + r * cos(radians(a)), y: CITY_CENTER.y + r * sin(radians(a)) };
}
function drawDividers() {
  stroke(40, 20, 10); strokeWeight(3);
  for (const [, , r0, r1, a0, a1] of SECTION_RULES) {
    if (a0 === 0 && a1 === 360) continue;
    for (const a of [a0, a1]) { const p = atAngle(a, max(r0, 1)), q = atAngle(a, r1); line(p.x, p.y, q.x, q.y); }
  }
  noStroke(); fill(20, 10, 5); textSize(40); textAlign(CENTER, CENTER);
  for (const [id, , r0, r1, a0, a1] of SECTION_RULES) {
    const span = (a1 - a0 + 360) % 360 || 360;
    const p = atAngle(a0 + span / 2, id === '1' ? 0 : (r0 + r1) / 2);
    text(id, p.x, p.y);
  }
}

// ═══════════════════════════════════════════════════════════
// Results of the pixel steps (4–9), computed when first needed
// ═══════════════════════════════════════════════════════════
const R = {};
const INFO = {};          // one line of numbers per step, shown under the step name
let busy = false;

function prepare(n) {
  if (!mapReady || n < 4) return;
  busy = true;
  setTimeout(() => {                      // let the "working…" message draw first
    if (n >= 4 && !R.blue) stepBlue();
    if (n >= 5 && !R.riverMask) stepCleanRiver();
    if (n >= 6 && !R.river) stepRiverOutline();
    if (n >= 7 && !R.near) stepBanks();
    if (n >= 8 && !R.sectionMasks) stepSections();
    if (n >= 9 && !R.polys) stepSectionOutlines();
    busy = false;
  }, 30);
}

// ═══════════════════════════════════════════════════════════
// Step 4: read the map's pixels and mark the blue ones
// ═══════════════════════════════════════════════════════════
function mapPixels() {
  const c = document.createElement('canvas'); c.width = MAP_W; c.height = MAP_H;
  const ctx = c.getContext('2d');
  ctx.drawImage(mapImg, 0, 0, MAP_W, MAP_H);
  return ctx.getImageData(0, 0, MAP_W, MAP_H).data;   // [r, g, b, a, r, g, b, a, …]
}
function stepBlue() {
  const px = mapPixels();
  const blue = new Uint8Array(MAP_W * MAP_H);
  for (let i = 0; i < blue.length; i++) {
    const r = px[4 * i], g = px[4 * i + 1], b = px[4 * i + 2];
    blue[i] = (b > r + 20 && b > g + 5) ? 1 : 0;      // clearly bluer than it is red or green
  }
  R.blue = blue;
  R.blueImg = maskImage(blue, [255, 0, 200, 170]);
  INFO[4] = `${count(blue).toLocaleString()} blue pixels, in ${regions(blue).sizes.length - 1} separate patches`;
}

// Turn a mask (1 per pixel) into a see-through coloured p5 image.
function maskImage(mask, rgba) {
  const img = createImage(MAP_W, MAP_H); img.loadPixels();
  for (let i = 0; i < mask.length; i++) if (mask[i]) img.pixels.set(rgba, 4 * i);
  img.updatePixels();
  return img;
}

// ═══════════════════════════════════════════════════════════
// Step 5: clean the mask into one solid river
// ═══════════════════════════════════════════════════════════
function stepCleanRiver() {
  let m = closeMask(R.blue, 4);           // bridge small gaps (ripples, drawn lines)
  m = fillHoles(m);                       // islands and specks inside the water
  m = largestRegion(m);                   // drop the pond and stray blue bits
  m = openMask(m, 2);                     // shave off thin spurs
  R.riverMask = m;
  R.riverImg = maskImage(m, [255, 0, 200, 170]);
  let added = 0, removed = 0;
  for (let i = 0; i < m.length; i++) { if (m[i] && !R.blue[i]) added++; if (!m[i] && R.blue[i]) removed++; }
  INFO[5] = `one river of ${count(m).toLocaleString()} pixels: ${added.toLocaleString()} filled in, ${removed.toLocaleString()} blue pixels dropped`;
}

// Grow a mask by r pixels in every direction (a square brush), in two quick passes.
function dilate(mask, r) {
  const W = MAP_W, H = MAP_H, tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {           // horizontal: any set pixel within r?
    let count = 0;
    for (let x = -r; x < W; x++) {
      if (x + r < W && mask[y * W + x + r]) count++;
      if (x - r - 1 >= 0 && mask[y * W + x - r - 1]) count--;
      if (x >= 0) tmp[y * W + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < W; x++) {           // then vertical
    let count = 0;
    for (let y = -r; y < H; y++) {
      if (y + r < H && tmp[(y + r) * W + x]) count++;
      if (y - r - 1 >= 0 && tmp[(y - r - 1) * W + x]) count--;
      if (y >= 0) out[y * W + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}
function count(mask) { let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i]; return n; }
function invert(mask) { const o = new Uint8Array(mask.length); for (let i = 0; i < mask.length; i++) o[i] = 1 - mask[i]; return o; }
function erode(mask, r) { return invert(dilate(invert(mask), r)); }
function closeMask(mask, r) { return erode(dilate(mask, r), r); }   // fills gaps narrower than 2r
function openMask(mask, r) { return dilate(erode(mask, r), r); }    // removes bits thinner than 2r

// Flood-fill from a pixel over every connected pixel where test(i) is true.
function flood(startIndex, test) {
  const W = MAP_W, H = MAP_H, seen = new Uint8Array(W * H), stack = [startIndex];
  seen[startIndex] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i - x) / W;
    if (x > 0 && !seen[i - 1] && test(i - 1)) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < W - 1 && !seen[i + 1] && test(i + 1)) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !seen[i - W] && test(i - W)) { seen[i - W] = 1; stack.push(i - W); }
    if (y < H - 1 && !seen[i + W] && test(i + W)) { seen[i + W] = 1; stack.push(i + W); }
  }
  return seen;
}
// Holes = background you can't reach from the edge of the image.
function fillHoles(mask) {
  const W = MAP_W, H = MAP_H, outside = new Uint8Array(W * H);
  const test = i => !mask[i] && !outside[i];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) {
    const i = y * W + x; if (test(i)) flood(i, test).forEach((v, k) => { if (v) outside[k] = 1; });
  }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) {
    const i = y * W + x; if (test(i)) flood(i, test).forEach((v, k) => { if (v) outside[k] = 1; });
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || !outside[i] ? 1 : 0;
  return out;
}
// Label connected regions; return a mask of the biggest.
function regions(mask) {
  const label = new Int32Array(mask.length), sizes = [0];
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    n++; sizes.push(0);
    const stack = [i]; label[i] = n;
    while (stack.length) {
      const j = stack.pop(), x = j % MAP_W; sizes[n]++;
      for (const k of [x > 0 ? j - 1 : -1, x < MAP_W - 1 ? j + 1 : -1, j - MAP_W, j + MAP_W]) {
        if (k >= 0 && k < mask.length && mask[k] && !label[k]) { label[k] = n; stack.push(k); }
      }
    }
  }
  return { label, sizes };
}
function largestRegion(mask) {
  const { label, sizes } = regions(mask);
  let best = 1; for (let k = 2; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

// ═══════════════════════════════════════════════════════════
// Step 6: trace the river's outline and simplify it to a polygon
// ═══════════════════════════════════════════════════════════
function stepRiverOutline() {
  const { label } = regions(R.riverMask);
  const traced = traceOutline(label, 1);
  let poly = simplifyClosed(traced, 2);
  INFO[6] = `${traced.length.toLocaleString()} edge pixels, simplified to ${poly.length} corners`;
  // Where it runs along the top or bottom of the image, put it exactly on the edge.
  R.river = poly.map(([x, y]) => [x, y <= 15 ? 0 : y >= MAP_H - 13 ? MAP_H : y]);
  // The river as a solid mask again, now from the polygon (this is what the sim will use).
  R.riverPoly = polygonMask(R.river);
}

// Walk around the edge of region `id`, keeping it on the right (Moore-neighbour tracing).
// Returns the boundary pixels in order.
const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];   // E, SE, S, SW, W, NW, N, NE
function traceOutline(label, id) {
  const W = MAP_W, H = MAP_H;
  const isIn = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === id;
  let start = label.indexOf(id);                       // top-most, then left-most pixel
  const sx = start % W, sy = (start - sx) / W;
  const pts = [[sx, sy]];
  let x = sx, y = sy, back = 4, firstMove = -1;        // we "came from" the west
  for (let guard = 0; guard < 4 * W * H; guard++) {
    let move = -1;
    for (let k = 1; k <= 8; k++) {                     // look clockwise, starting after `back`
      const d = (back + k) % 8;
      if (isIn(x + DX[d], y + DY[d])) { move = d; break; }
    }
    if (move < 0) break;                               // a single isolated pixel
    if (x === sx && y === sy && move === firstMove) break;   // back where we began
    if (firstMove < 0) firstMove = move;
    x += DX[move]; y += DY[move];
    back = move % 2 === 0 ? (move + 6) % 8 : (move + 5) % 8;  // the empty pixel we just passed
    pts.push([x, y]);
  }
  pts.pop();                                           // the last point repeats the first
  return pts;
}

// Douglas–Peucker: keep only the points needed to stay within `tol` pixels of the outline.
function simplifyOpen(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  let best = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointSegDist(pts[i][0], pts[i][1], ax, ay, bx, by);
    if (d > best) { best = d; idx = i; }
  }
  if (best <= tol) return [pts[0], pts[pts.length - 1]];
  return simplifyOpen(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplifyOpen(pts.slice(idx), tol));
}
function simplifyClosed(pts, tol) {
  // Split the loop at the point farthest from the first, simplify both halves.
  let far = 0, fd = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[0][0], pts[0][1], pts[i][0], pts[i][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = simplifyOpen(pts.slice(0, far + 1), tol);
  const b = simplifyOpen(pts.slice(far).concat([pts[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
// Fill a polygon into a mask by letting the browser draw it.
function polygonMask(poly) {
  const c = document.createElement('canvas'); c.width = MAP_W; c.height = MAP_H;
  const ctx = c.getContext('2d');
  ctx.beginPath(); poly.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
  const d = ctx.getImageData(0, 0, MAP_W, MAP_H).data, m = new Uint8Array(MAP_W * MAP_H);
  for (let i = 0; i < m.length; i++) m[i] = d[4 * i + 3] > 127 ? 1 : 0;
  return m;
}
function drawRiverOutline() {
  noFill(); stroke(255, 0, 200); strokeWeight(4);
  beginShape(); for (const [x, y] of R.river) vertex(x, y); endShape(CLOSE);
  noStroke(); fill(255, 0, 200);
  for (const [x, y] of R.river) circle(x, y, 7);
}

// ═══════════════════════════════════════════════════════════
// Step 7: the two banks. The river cuts the land in two; flood
// from the centre to find the near bank, from the far side for the other.
// ═══════════════════════════════════════════════════════════
const FAR_SEED = { x: 300, y: 700 };
function stepBanks() {
  const land = i => !R.riverPoly[i];
  R.near = flood(CITY_CENTER.y * MAP_W + CITY_CENTER.x, land);
  R.far = flood(FAR_SEED.y * MAP_W + FAR_SEED.x, land);
  const img = createImage(MAP_W, MAP_H); img.loadPixels();
  for (let i = 0; i < R.near.length; i++) {
    if (R.near[i]) img.pixels.set([250, 200, 60, 90], 4 * i);
    else if (R.far[i]) img.pixels.set([60, 120, 220, 90], 4 * i);
  }
  img.updatePixels(); R.bankImg = img;
  INFO[7] = `near bank ${count(R.near).toLocaleString()} px (yellow), far bank ${count(R.far).toLocaleString()} px (blue)`;
}

// ═══════════════════════════════════════════════════════════
// Step 8: each section = pixels on its bank, between its radii, inside its angles
// ═══════════════════════════════════════════════════════════
function stepSections() {
  R.sectionMasks = {};
  const img = createImage(MAP_W, MAP_H); img.loadPixels();
  SECTION_RULES.forEach(([id, bank, r0, r1, a0, a1], n) => {
    const side = bank === 'far' ? R.far : R.near;
    const m = new Uint8Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (!side[i]) continue;
      const r = Math.hypot(x - CITY_CENTER.x, y - CITY_CENTER.y);
      if (r < r0 || r >= r1) continue;
      const a = (Math.atan2(y - CITY_CENTER.y, x - CITY_CENTER.x) * 180 / Math.PI + 360) % 360;
      if (inSector(a, a0, a1)) m[i] = 1;
    }
    // Keep only pieces of at least 1,500 px: slivers cut off by the river aren't worth a section.
    const { label, sizes } = regions(m);
    const keep = new Set(); sizes.forEach((s, k) => { if (k && s >= 1500) keep.add(k); });
    let area = 0;
    for (let i = 0; i < m.length; i++) {
      m[i] = keep.has(label[i]) ? 1 : 0;
      if (m[i]) { area++; img.pixels.set([...PALETTE[n], 110], 4 * i); }
    }
    R.sectionMasks[id] = { mask: m, label, keep: [...keep], area };
  });
  img.updatePixels(); R.sectionImg = img;
  INFO[8] = 'land area: ' + SECTION_RULES.map(([id]) => `${id} ${(R.sectionMasks[id].area / 1000).toFixed(0)}k`).join('  ');
}
function drawLabels() {
  noStroke(); fill(20, 10, 5); textSize(40); textAlign(CENTER, CENTER);
  for (const [id] of SECTION_RULES) {
    const s = R.sectionMasks && R.sectionMasks[id]; if (!s || !s.area) continue;
    if (!s.labelAt) {                        // the section's own pixel nearest its average position
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < s.mask.length; i += 7) if (s.mask[i]) { sx += i % MAP_W; sy += Math.floor(i / MAP_W); n++; }
      const cx = sx / n, cy = sy / n; let best = Infinity;
      for (let i = 0; i < s.mask.length; i += 7) if (s.mask[i]) {
        const x = i % MAP_W, y = Math.floor(i / MAP_W), d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < best) { best = d; s.labelAt = { x, y }; }
      }
    }
    text(id, s.labelAt.x, s.labelAt.y);
  }
}

// ═══════════════════════════════════════════════════════════
// Step 9: trace each section's outline, and find the bridge
// ═══════════════════════════════════════════════════════════
const BRIDGE_TICK = [{ x: 533, y: 493 }, { x: 577, y: 532 }];   // the pink tick on the sketch
function stepSectionOutlines() {
  R.polys = {};
  for (const [id] of SECTION_RULES) {
    const s = R.sectionMasks[id];
    R.polys[id] = s.keep.map(k => simplifyClosed(traceOutline(s.label, k), 1.5));
  }
  // Bridge: from the middle of the tick, walk each way along it until on land, then 3 px more.
  const mid = { x: (BRIDGE_TICK[0].x + BRIDGE_TICK[1].x) / 2, y: (BRIDGE_TICK[0].y + BRIDGE_TICK[1].y) / 2 };
  let ux = BRIDGE_TICK[1].x - BRIDGE_TICK[0].x, uy = BRIDGE_TICK[1].y - BRIDGE_TICK[0].y;
  const L = Math.hypot(ux, uy); ux /= L; uy /= L;
  const walk = (dir, bank) => {
    let x = mid.x, y = mid.y;
    while (!bank[Math.round(y) * MAP_W + Math.round(x)]) { x += dir * ux; y += dir * uy; }
    return { x: Math.round(x + dir * ux * 3), y: Math.round(y + dir * uy * 3) };
  };
  R.bridge = { near: walk(1, R.near), far: walk(-1, R.far) };
  INFO[9] = 'corners: ' + SECTION_RULES.map(([id]) => `${id} ${R.polys[id].map(p => p.length).join('+')}`).join('  ') +
    `     bridge (${R.bridge.near.x}, ${R.bridge.near.y}) → (${R.bridge.far.x}, ${R.bridge.far.y})`;
}
function drawSectionOutlines() {
  strokeWeight(3);
  SECTION_RULES.forEach(([id], n) => {
    stroke(...PALETTE[n]); fill(...PALETTE[n], 60);
    for (const poly of R.polys[id]) { beginShape(); for (const [x, y] of poly) vertex(x, y); endShape(CLOSE); }
  });
}
function drawBridge() {
  stroke(200, 40, 0); strokeWeight(9);
  line(R.bridge.near.x, R.bridge.near.y, R.bridge.far.x, R.bridge.far.y);
}

// ═══════════════════════════════════════════════════════════
// Export: write everything as geometry_built.js
// ═══════════════════════════════════════════════════════════
const HOURS_TEXT = `const HOURS = [
  [['1', 60]], [['2NE', 60]], [['2SW', 60]], [['3', 60]], [['4', 40], ['4.5', 20]],
  [['5', 60]], [['6', 60]], [['7', 60]], [['8', 60]], [['9', 60]], [['10', 60]], [['11', 60]],
];`;
function pointRows(pts, indent) {
  const rows = [];
  for (let i = 0; i < pts.length; i += 12) rows.push(indent + pts.slice(i, i + 12).map(([x, y]) => `[${x},${y}]`).join(', ') + ',');
  return rows;
}
function exportGeometry() {
  if (!R.polys) { prepare(9); step = 9; setTimeout(exportGeometry, 200); return; }
  const L = [
    '// geometry_built.js — made by the geometry workbench. Base map 2454×1728, pixel coords, y down.',
    '// Angles: degrees clockwise from east. Sectors run clockwise a0 → a1; a0 > a1 wraps through 0°.',
    `const MAP_W = ${MAP_W}, MAP_H = ${MAP_H};`,
    `const CITY_CENTER = { x: ${CITY_CENTER.x}, y: ${CITY_CENTER.y} };`,
    `const RING_R = [${RING_R.join(', ')}];`,
    `const FAR_INNER_R = ${FAR_INNER_R};`,
    `const FAR_OUTER_R = ${FAR_OUTER_R};`,
    '', HOURS_TEXT, '', 'const SECTIONS = {',
  ];
  for (const [id, bank, r0, r1, a0, a1] of SECTION_RULES) {
    L.push(`  '${id}': { side: '${bank}', rIn: ${r0}, rOut: ${r1}, a0: ${a0}, a1: ${a1}, landArea: ${R.sectionMasks[id].area},`);
    L.push('    poly: [');
    for (const poly of R.polys[id]) { L.push('      ['); L.push(...pointRows(poly, '        ')); L.push('      ],'); }
    L.push('    ] },');
  }
  L.push('};', '');
  L.push(`const BRIDGE = { near: { x: ${R.bridge.near.x}, y: ${R.bridge.near.y} }, far: { x: ${R.bridge.far.x}, y: ${R.bridge.far.y} } };`);
  L.push('const RIVER_BUFFER = 6;');
  L.push(`// River water polygon (${R.river.length} vertices).`, 'const RIVER = [');
  L.push(...pointRows(R.river, '  '));
  L.push('];');
  saveStrings(L, 'geometry_built', 'js');
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }
