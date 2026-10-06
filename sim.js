// sim.js — the city-growth simulation for the whole day: fourteen hours (05:00–19:00), one section each, then dusk.
//   05:00–09:00  the old city: the active-walker model (section 5 of this file)
//   09:00–19:00  each hour's streets are planned block by block at its start (planCuts), around main
//                roads that the hour's walkers wear between the city, the hubs and the gates (dayWalk)
//   (the first hour across the river still grows street by street, from the bridge)
// Pure JavaScript with no p5 dependency: sketch.js reads this object and draws it.
// Coordinates are base-map pixels (y down), the same as geometry.js.
// Everything is wrapped in a function so helper names (dist, centroid…) stay private
// and can't clash with p5's own globals.
(function () {

  // ─────────────────────────────────────────────────────────────
  // 1. Configuration
  // ─────────────────────────────────────────────────────────────
  const CFG = {
    M_PER_PX: 4.5,        // metres per map pixel. At 4.5, section 1 (495 m across its radius) is the
                          // size of walker.py's whole old core, and its 60 blocks match the
                          // organic junction density (~120 per km²)
    ORGANIC_UNTIL: 0.3,   // sections with character t below this grow by the walker model (section 5)
    SUB: 0.1,             // fixed simulation step in seconds (keeps runs deterministic)
    STEP: 1.5,            // px a growing street advances per internal step
    GROW_TIME: 6,         // s for a new street to reach full length (long enough that one is nearly always moving)
    FADE_TIME: 8,         // s for a rejected street to fade away
    SNAP_R: 4,            // px (12 m): tips this close to a street join it
    MIN_ANGLE: 60,        // deg: sharpest junction allowed, at either end of a new street
    MIN_SEG: 6,           // px: shortest street segment allowed
    JUNCTION_GAP: 0.5,    // × block side: closest two parallel side streets may sit
    FRONT_START: 0.35,    // each section's growth front starts this far across it and spreads
                          // to its far edge over its time; streets inside it sprout far more
    CORNER_TOL: [35, 15], // deg, old → new: a bend sharper than this counts as a block corner
    RECT_TOL: [35, 20],   // deg, old → new: a block's corners must be within this of square
    AIM_R: 0.8,           // × side-street spacing: a new street landing this close to a
                          // junction is tilted to land exactly on it…
    AIM_MAX: 10,          // …as long as that tilts it by no more than this many degrees
    FILL_FRAC: 0.65,      // sets the old core's street spacing (via its block size)
    COVER: 0.85,          // share of each section's land its 60 blocks should cover between them
                          // (until the peak; after it blocks keep the peak's size and the city thins)
    PEAK_HOUR: '13',      // the last hour on the S-curve; later blocks are capped at its block size
    SUBURB_FROM: 0.65,    // from this character t, new streets keep to corridors along main roads…
    CORRIDOR: [4, 1.5],   // …this many strips of blocks either side, narrowing to the last at t = 1
    SUBURB_AVENUE_M: 1100,// suburban main roads spread out to this spacing by t = 1
    PACE: 4,              // street length allowed per section ≈ PACE × land / block side, spread
                          // evenly over its hour, so streets keep growing to the last minute
    ART_SPACING_M: 400,   // main roads (arterials) keep at least this far from a parallel one
    AVENUE_M: 600,        // spacing of a gridded section's avenues, on one lattice anchored at the market
    AVENUE_FROM: 0.75,    // only sections with at least this grid strength lay avenues
    WOBBLE: [18, 2],      // deg: random wobble on each new street after the grid pull, from no grid to full grid
    ART_TURN: 20,         // deg: a road "continues" another through a junction within this
    ART_MIN_LEN: 30,      // px: shortest thoroughfare worth carrying across a section
    MAX_MAIN_ROADS: 20,   // the most main roads laid in a day (trail roads, carried roads and avenues); each must join the network
    MAIN_ROADS_PER_HOUR: 2, // …and the most in one hour, so the day's main roads are shared out, not used up by midday
    PACE_HEADSTART: 8,    // minutes' worth of street length each section starts with
    WIDEN_EVERY: 2,       // minutes between main roads widening (in sections that widen)
    FACE_SHARE: 0.6,      // street spacing: a block cell is this share of a block's land (neighbouring cells merge into blocks)
    ORDER_FROM_HOUR: 3,   // order rises linearly from the 4th hour (08:00 = 0)…
    ORDER_TO_HOUR: 13,    // …to the last (18:00 = 1); and with distance from the market:
    ORDER_DIST_M: [500, 5500], // 0 at 500 m, 1 at 5.5 km. A street's order is the higher of the two
    CUT_WOBBLE: 18,       // deg: angle wobble of a cut street at order 0 (none at order 1)
    CUT_SPACING_JITTER: 0.35, // spacing wobble at order 0, as a share of the spacing
    CUT_ASPECT: [1.2, 2.0],   // block length / width, from order 0 to 1
    CUT_DISTRICTS: 4,     // at most this many main roads an hour set their own grain for the blocks beside them…
    CUT_DISTRICT_MIN_DEG: 8, // …if they run at least this far off the section's grain…
    CUT_DISTRICT_DEPTH: 3,// …for this many strips of blocks either side
    EDGE_SPURS: 0.6,      // at the city's edge, the chance a street carries on one block past the last blocks
    PATCH_BLOCKS: [6, 90], // from 09:00 the land is laid out in regular patches of about this many blocks (order 0 to 1)…
    PATCH_TURN: 30,       // …each turned off the grain: the patches' turns are spread over ± this many degrees at order 0…
    PATCH_TURN_SHAPE: 1.3,// …narrowing as (1 − order) to this power (set so the hour's angle entropy falls in a straight line)…
    PATCH_SCALE_SD: 0.18, // …with its own block size (log sd at order 0)…
    PATCH_ASPECT_SD: 0.15,// …and its own block proportions (log sd at order 0)
    BLOCK_JITTER_UNTIL: 0.35, // block-by-block wobble (spacing, tilt) fades out by this order; after it only patches differ
    CUT_MIN_CELLS: 76,    // an hour's lattice must offer at least this many whole block cells (finer blocks if not)…
    SUBURB_RIBBONS: 0.6,  // suburbs: how strongly every third strip of blocks is left for last (0 = no ribbons)
    CUT_SUBURB_KEEP: 0.65,// …and the outermost suburbs build this share of theirs (never fewer than the minimum)
    MIN_COMPACT: 0.8,     // a merged block must fill at least this share of its convex outline…
    MIN_COMPACT_ANY: 0.65,// …and a single area accepted when behind the clock at least this
    P_TIP: 0.3,           // chance a spawn extends a dead end (falls to 0 in new areas)
    P_ENTRY: 0.3,         // chance a spawn carries a street on across from an earlier section
    P_RIVERSIDE: 0,       // (v1's bank-to-bank links; off since river v3: water lanes and a late embankment instead)
    RIVERSIDE_SHARE: 0.5, // share of streets reaching the bank that may join a riverside street
    CUL_DE_SAC: 1,        // × (dead-end target above the old core's): chance a spawn is a cul-de-sac
    MAX_REACH: 6,         // × segment length: how far a new street looks for a street to join
    MAX_PRUNE: 1,         // most streets faded per minute
    PRUNE_EPS: 0.2,       // how much a street must be hurting the character before it's faded
    WINDOW_R: 250 / 4.5,  // px (250 m): the local window for measuring character
    WIDTH0: 0.9, WIDTH_MAX: 2.8, WIDTH_BLOCK: 0.15, WIDTH_USE: 0.02, WIDTH_ROAD: 0.5,
    THICKEN_FROM: 0.3,    // streets only start widening once the character t reaches this
    GRID_FROM: 0.28,      // from this character t on (09:00), new streets are pulled onto a grid…
    GRID_FULL: 0.92,      // …fully by this one (17:00). The grid's direction comes from the streets
    GRID_SHAPE: 0.6,      // <1 front-loads the ramp
                          // already built, so a grid that forms in the middle rings carries on
    DUSK_LENGTH: 7200,    // s after the last section: the city keeps tidying itself at dusk
    DUSK_EXTEND_EVERY: 15,// s between streets pushed out past the city's edge at dusk
    SEAM_MIN: 20,         // px²: enclosed ground in a finished section is shaded once later streets close it off (slivers aside)…
    SEAM_SUBURB: 0.6,     // …but in a suburb section only scraps under this share of a block: its empty lots stay open
    STUB_REACH: 1.5,      // block sides: a street left ending in mid-air carries on this far to meet the next street; if it can't, it goes
    SQUARE_MIN: 1.2,      // a hub's square is between this many of the hour's blocks in size…
    SQUARE_MAX: 2.2,      // …and this many (old city)…
    SQUARE_GROW: 0.22,    // …and in a planned hour its cell is this share of a block longer at each end
    DUSK_FILL_EVERY: 20,  // s between leftover areas filled in at dusk
    EDGE_THIN_PX: 80,     // over the last ~360 m of the city, fewer streets start and blocks are filled last…
    EDGE_THIN: 0.6,       // …so it thins toward its edge (the chance a new street there is skipped, at the very edge)
    RESIST_R_M: 200,      // in resistance land, a new street or house needs filled blocks within this…
    RESIST_MIN_BLOCKS: 2, // …this many of them…
    RESIST_UNTIL: 0.4,    // …until this share of the hour; after that resistance land grows like any other
    GRAIN_BAND: 60,       // px: streets this close outside a new section set its grid direction
    GRAIN_MAIN: 3,        // weight of a main street in that, relative to a lane
    RELAX_AFTER: 0.67,    // share of a section's time after which less tidy blocks are accepted
    RELAX_RECT: 15,       // deg added to the corner tolerance then
    SOFTMAX_T: 0.3,       // randomness when choosing which block to fill
  };

  // Character targets. OLD: the organic-core targets from the walker report (Staré Město +
  // Paris 1380 windows): orientation entropy 3.02 of a possible ln 36 = 3.58, dead ends 11%,
  // 11° off square, median segment 74 m, circuity 1.07, 28% four-way. NEW: the planned-district
  // column for entropy (2.58), dead ends, circuity and four-way; squarer junctions and longer
  // segments than that, for the gridded outer rings.
  const OLD    = { entropy: 0.84, deadEnd: 0.11, jDev: 11, segLen: 74,  circuity: 1.07, fourWay: 0.28 };
  const NEW    = { entropy: 0.72, deadEnd: 0.20, jDev: 5,  segLen: 165, circuity: 1.09, fourWay: 0.27 };
  const SCALE  = { entropy: 0.05, deadEnd: 0.10, jDev: 5,  segLen: 20,  circuity: 0.03, fourWay: 0.15 };
  const WEIGHT = { entropy: 1.0,  deadEnd: 0.9,  jDev: 0.8, segLen: 0.8, circuity: 0.5, fourWay: 0.5 };
  function characterAt(t) {
    const o = {};
    for (const k in OLD) o[k] = OLD[k] + (NEW[k] - OLD[k]) * t;
    return o;
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  // ─────────────────────────────────────────────────────────────
  // 2. Small helpers: seeded randomness and geometry
  // ─────────────────────────────────────────────────────────────
  function hashString(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return h >>> 0;
  }
  function makeRng(seed) {                         // mulberry32
    let a = hashString(String(seed));
    const rng = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    rng.getState = () => a;
    rng.setState = v => { a = v; };
    rng.range = (lo, hi) => lo + (hi - lo) * rng();
    return rng;
  }

  const DEG = Math.PI / 180;
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const angleOf = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

  // Where segment p→q crosses segment a→b. Returns {t, u} (fractions along each) or null.
  function segHit(p, q, a, b) {
    const rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
    const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
    return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? { t, u } : null;
  }
  function distToSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  function pointInPoly(p, poly) {                  // poly: [[x,y], ...]
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inRingPts(p, pts) {                     // pts: [{x,y}, ...]
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function signedArea(pts) {
    let s = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    return s / 2;
  }
  // Float32Array ⇄ base64, for saving the trail field compactly.
  function f32ToB64(a) {
    const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64');
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToF32(b) {
    let u;
    if (typeof Buffer !== 'undefined') u = new Uint8Array(Buffer.from(b, 'base64'));
    else { const s = atob(b); u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); }
    return new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4);
  }
  function decodeBytes(b) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b, 'base64'));
    const s = atob(b), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  // Inside a section: an odd number of its outlines contain the point (holes are outlines too).
  function inPolys(p, polys) { let k = 0; for (const poly of polys) if (pointInPoly(p, poly)) k++; return (k & 1) === 1; }
  // How compact a shape is: its area over the area of its convex outline (1 = convex).
  function compactness(rings) {
    let a = 0; for (const r of rings) a += Math.abs(signedArea(r));
    const p = rings.flat().slice().sort((u, v) => u.x - v.x || u.y - v.y);
    const cr = (o, u, v) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    const h = Math.abs(signedArea(lo.slice(0, -1).concat(up.slice(0, -1))));
    return h > 0 ? a / h : 1;
  }
  // A point inside an outline: its middle if that is inside, else just inside one of its sides.
  function interiorPoint(pts) {
    const c = centroid(pts); if (inRingPts(c, pts)) return c;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 3) continue;
      for (const s of [1, -1]) { const q = { x: (a.x + b.x) / 2 - s * (b.y - a.y) / L * 1.5, y: (a.y + b.y) / 2 + s * (b.x - a.x) / L * 1.5 }; if (inRingPts(q, pts)) return q; }
    }
    return c;
  }
  function median(a) { const b = a.slice().sort((p, q) => p - q), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; }
  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  }
  function polylineLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    return L;
  }
  // Douglas–Peucker on an open polyline.
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    let best = -1, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distToSeg(pts[i], pts[0], pts[pts.length - 1]);
      if (d > best) { best = d; idx = i; }
    }
    if (best <= tol) return [pts[0], pts[pts.length - 1]];
    const left = simplify(pts.slice(0, idx + 1), tol), right = simplify(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  // The turn at each sharp corner around a closed polygon, in degrees (90 = square corner).
  function cornerTurns(pts, tolDeg) {
    // Start the simplification at the point farthest from the first vertex so a corner isn't split.
    let far = 0, fd = -1;
    for (let i = 0; i < pts.length; i++) { const d = dist(pts[0], pts[i]); if (d > fd) { fd = d; far = i; } }
    const a = simplify(pts.slice(0, far + 1), 1.2);
    const b = simplify(pts.slice(far).concat([pts[0]]), 1.2);
    const ring = a.slice(0, -1).concat(b.slice(0, -1));
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const p0 = ring[(i - 1 + ring.length) % ring.length], p1 = ring[i], p2 = ring[(i + 1) % ring.length];
      const turn = Math.abs(wrapPi(angleOf(p1, p2) - angleOf(p0, p1))) / DEG;
      if (turn > tolDeg) out.push(turn);
    }
    return out;
  }
  const countCorners = (pts, tolDeg) => cornerTurns(pts, tolDeg).length;

  // ─────────────────────────────────────────────────────────────
  // 3. Spatial hash: finds nearby streets without checking every one
  // ─────────────────────────────────────────────────────────────
  class SpatialHash {
    constructor(cell) { this.cell = cell; this.map = new Map(); }
    _cells(x0, y0, x1, y1, fn) {
      const c = this.cell;
      for (let i = Math.floor(Math.min(x0, x1) / c); i <= Math.floor(Math.max(x0, x1) / c); i++)
        for (let j = Math.floor(Math.min(y0, y1) / c); j <= Math.floor(Math.max(y0, y1) / c); j++) fn(i * 100003 + j);
    }
    add(edge) {
      edge.cells = new Set();
      for (let i = 1; i < edge.pts.length; i++) {
        const a = edge.pts[i - 1], b = edge.pts[i];
        this._cells(a.x, a.y, b.x, b.y, k => {
          if (!this.map.has(k)) this.map.set(k, new Set());
          this.map.get(k).add(edge.id); edge.cells.add(k);
        });
      }
    }
    remove(edge) { for (const k of edge.cells || []) this.map.get(k)?.delete(edge.id); }
    query(x0, y0, x1, y1) {
      const out = new Set();
      this._cells(x0, y0, x1, y1, k => { const s = this.map.get(k); if (s) for (const id of s) out.add(id); });
      return out;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. The simulation
  // ─────────────────────────────────────────────────────────────
  class CitySim {
    // opts: { seed, geometry: { SECTIONS, HOURS, CITY_CENTER, RIVER, BRIDGE, RIVER_BUFFER } }
    constructor(opts) {
      const g = opts.geometry;
      this.seed = opts.seed;
      this.rng = makeRng(opts.seed);
      this.sections = g.SECTIONS; this.center = g.CITY_CENTER; this.river = g.RIVER;
      this.mapW = g.MAP_W || 2454; this.mapH = g.MAP_H || 1728;
      // Zones (zones.js): 0 free, 1 floodplain, 2 resistance, 3 no-grow high ground, 4 river.
      this.zones = g.ZONES ? { cell: g.ZONES.cell, w: g.ZONES.w, h: g.ZONES.h, code: decodeBytes(g.ZONES.code),
                               edge: g.ZONES.edge ? decodeBytes(g.ZONES.edge) : null } : null;
      this.bridgeAt = g.BRIDGE; this.riverBuffer = g.RIVER_BUFFER || 6;

      // The timetable: every section's start and end, in seconds since 12:00.
      this.schedule = []; let t0 = 0;
      g.HOURS.forEach(entries => entries.forEach(([id, minutes]) => {
        this.schedule.push({ id, start: t0, end: t0 + minutes * 60, minutes });
        t0 += minutes * 60;
      }));
      this.schedule.forEach((s, k) => { s.order = k; s.t = k / (this.schedule.length - 1); });
      // Block size grows with the square of the target segment length (45 m → 110 m).
      this.blockAreaOld = (this.sections[this.schedule[0].id].landArea * CFG.FILL_FRAC) / 60;
      this.firstFar = (this.schedule.find(x => this.sections[x.id].origin === 'bridge') || {}).id;
      // After the peak, blocks keep the peak's size (the city thins out rather than shrinking its blocks).
      const upTo = this.schedule.findIndex(x => x.id === CFG.PEAK_HOUR);
      this.blockCap = Math.max(...this.schedule.slice(0, upTo + 1).map(x => this.sections[x.id].landArea * CFG.COVER / x.minutes));

      this.nodes = new Map(); this.edges = new Map(); this.nextId = 1;
      this.hash = new SpatialHash(12);
      this.bySection = new Map();   // section id → Set of edge ids grown in it
      this.fading = new Set();
      this.growing = [];            // streets still extending
      this.blocks = [];             // filled blocks, all sections
      this.bbCache = new WeakMap(); // block → its bounding box (for shadedAt)
      this.squares = [];            // the hubs' squares: one enclosed area left open at each odd hour
      this.squareAt = {};           // section id → the point its square must hold (the market, a village, a hub)
      this.filledKeys = new Set();  // the streets around each filled face, so none is filled twice
      this.events = [];             // things the renderer may want to pulse
      this.sub = 0;                 // sub-steps elapsed (time = sub × SUB seconds since 12:00)
      this.stats = { spawned: 0, rejected: 0, faded: 0 };
      this.frozenVersion = 0;       // goes up whenever finished sections change (for the renderer)
      this.organicSetup();          // the market, villages, gates and trail field (section 5)
      this.stage = -1;
      this.enterStage(0);
    }
    get time() { return this.sub * CFG.SUB; }

    // ── 4a. Sections: switching, and each section's rules ────
    enterStage(k) {
      if (this.stage >= 0) this.freeze();
      this.stage = k;
      const st = this.schedule[k], S = this.sections[st.id];
      this.st = st; this.section = S; this.sid = st.id; this.t = st.t;
      this.T = characterAt(st.t);
      this.segLenPx = this.T.segLen / CFG.M_PER_PX;
      this.blockArea = this.blockAreaOld * (this.T.segLen / OLD.segLen) ** 2;
      this.quota = st.minutes;                               // one block a minute: the count is the minute
      this.blockTarget = Math.min((S.landArea * CFG.COVER) / st.minutes, this.blockCap);   // each minute's share, capped
      const sr = (st.t - CFG.SUBURB_FROM) / (1 - CFG.SUBURB_FROM);
      this.suburb = Math.min(1, Math.max(0, sr));           // 0 = city, 1 = outer suburbs
      // Street spacing follows from that share, so every hour can hold its 60 blocks: big
      // blocks in the broad midday sections, finer ones in the small morning and evening ones.
      // (The old core's ratio of segment length to block size, 74 m to ~411 px², is kept.)
      this.blockArea = CFG.FACE_SHARE * this.blockTarget;   // streets a little finer than the blocks
      this.segLenPx = 0.81 * Math.sqrt(this.blockArea);
      this.T.segLen = this.segLenPx * CFG.M_PER_PX;
      this.minBlock = 0.4 * this.blockArea;
      this.maxBlock = 2.5 * this.blockArea;
      this.junctionGap = CFG.JUNCTION_GAP * Math.sqrt(this.blockArea);
      this.maxReach = CFG.MAX_REACH * this.segLenPx;
      this.pacePerSec = CFG.PACE * S.landArea / Math.sqrt(this.blockArea) / (st.minutes * 60);
      this.budget = CFG.PACE_HEADSTART * 60 * this.pacePerSec;   // a head start, so blocks can form at once
      this.thicken = st.t >= CFG.THICKEN_FROM;
      this.cornerTol = lerp(CFG.CORNER_TOL[0], CFG.CORNER_TOL[1], st.t);
      this.rectTol = lerp(CFG.RECT_TOL[0], CFG.RECT_TOL[1], st.t);
      this.pTip = CFG.P_TIP * (1 - st.t);
      this.pCul = Math.max(0, this.T.deadEnd - OLD.deadEnd) * CFG.CUL_DE_SAC;
      this.filled = 0; this.debt = 0; this.quarterOwed = false; this.seamSeen = null;
      (this.quotaLog = this.quotaLog || {})[this.sid] = this.quota;
      if (!this.bySection.has(this.sid)) this.bySection.set(this.sid, new Set());

      // Where growth starts from. Section 4.5 grows from where the bridge lands; the rest
      // spread outward from the city centre, starting at their inner edge.
      const pts = S.poly.flat().map(([x, y]) => ({ x, y }));
      const fromBridge = S.origin === 'bridge';
      this.origin = fromBridge ? { x: this.bridgeAt.far.x, y: this.bridgeAt.far.y } : this.center;
      this.frontFrom = S.rIn;
      this.extent = Math.max(...pts.map(p => dist(p, this.origin)));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      this.box = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      this.box.r = Math.max(...pts.map(p => dist(p, this.box))) + 20;
      this.touchesRiver = pts.some(p => this.nearRiver(p, 12));

      // The grid: continue the grain of the finished streets bordering this section. Take the
      // most common direction (modulo 90°) among streets within GRAIN_BAND of the section,
      // weighted by length, with main streets counting GRAIN_MAIN times; a histogram peak, not
      // an average, so a clear local grain wins over the mixture of every direction nearby.
      // A steady ramp, front-loaded (the grid's effect only shows once the pull is fairly strong),
      // so order rises hour by hour instead of arriving all at once.
      const gRaw = Math.min(1, Math.max(0, (st.t - CFG.GRID_FROM) / (CFG.GRID_FULL - CFG.GRID_FROM)));
      this.gridStrength = Math.pow(gRaw, CFG.GRID_SHAPE);
      if (this.gridStrength > 0) {
        const a = this.grainAround(S);
        if (a !== null) this.gridAngle = a;
        if (this.gridAngle === undefined) this.gridStrength = 0;
      }
      (this.gridLog = this.gridLog || {})[this.sid] = this.gridStrength;

      // Streets that ended at this section's edge in earlier hours: they can carry on into it.
      this.entries = [...this.nodes.values()].filter(n => n.gate && n.edges.size === 1 && this.entersSection(n));
      if (!this.quiet && k > 0 && st.t >= CFG.ORGANIC_UNTIL && this.sid !== this.firstFar && this.entries.length < 3 && !this.plans) this.walkIn();
      if (!this.quiet && k > 0 && st.t >= CFG.ORGANIC_UNTIL && this.sid !== this.firstFar && this.plans) { this.sectionMainLines = []; if (!this.netSeeded) this.seedNetwork(); this.joinMainRoads(); this.dayWalk(); this.thoroughfares(); this.connectMainRoads(); this.avenues(); this.planCuts(); }

      this.stageLen = (st.minutes * 60) / WALK.stages;
      if (!this.quiet) {
        if (st.t < CFG.ORGANIC_UNTIL) { this.organicStart(); this.organicStage(0); }
        else if (k === 0) this.seedFrom(this.addNode(this.center.x, this.center.y), this.seedDirections(this.center), 1);
      }
      if (this.sid === this.firstFar && !this.quiet) this.seedFarBank();
    }
    // A section's hour is over: everything in it is fixed from now on.
    freeze() {
      for (const id of this.bySection.get(this.sid) || []) {
        const e = this.edges.get(id);
        if (e && this.isActive(e)) { e.state = 'CEMENTED'; e.frozen = true; }
      }
      this.frozenVersion++;
    }
    entersSection(n) {
      const e = this.edges.get([...n.edges][0]); if (!e) return false;
      const h = this.dirAt(n, e) + Math.PI;
      return this.inSection({ x: n.x + Math.cos(h) * 3, y: n.y + Math.sin(h) * 3 });
    }
    inFinishedSection(p) {
      for (let k = 0; k < this.stage; k++) if (inPolys(p, this.sections[this.schedule[k].id].poly)) return true;
      return false;
    }
    // The dominant street direction (radians, modulo 90°) of finished streets bordering section S.
    grainAround(S) {
      const band = CFG.GRAIN_BAND, bins = new Float64Array(90);
      const pts = S.poly.flat();
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const x0 = Math.min(...xs) - band, x1 = Math.max(...xs) + band, y0 = Math.min(...ys) - band, y1 = Math.max(...ys) + band;
      let total = 0;
      for (const id of this.hash.query(x0, y0, x1, y1)) {
        const e = this.edges.get(id);
        if (!e || !this.isActive(e) || !e.frozen) continue;
        const m = { x: (e.pts[0].x + e.pts[e.pts.length - 1].x) / 2, y: (e.pts[0].y + e.pts[e.pts.length - 1].y) / 2 };
        if (inPolys(m, S.poly)) continue;
        let near = false;
        for (const pl of S.poly) { for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
          if (distToSeg(m, { x: pl[j][0], y: pl[j][1] }, { x: pl[i][0], y: pl[i][1] }) < band) { near = true; break; } } if (near) break; }
        if (!near) continue;
        const deg = ((angleOf(e.pts[0], e.pts[e.pts.length - 1]) / DEG) % 90 + 90) % 90;
        const w = e.len * (e.main ? CFG.GRAIN_MAIN : 1);
        bins[Math.floor(deg) % 90] += w; total += w;
      }
      if (total < 200) return null;                            // too little to go on
      let best = 0, bestV = -1;
      for (let b = 0; b < 90; b++) {                           // smooth over ±6°, wrapping at 90
        let v = 0; for (let d = -6; d <= 6; d++) v += bins[(b + d + 90) % 90] * (1 - Math.abs(d) / 7);
        if (v > bestV) { bestV = v; best = b; }
      }
      return (best + 0.5) * DEG;
    }
    // The dominant street direction (radians, modulo 90°) of the streets within r of p, or null.
    grainNear(p, r) {
      const bins = new Float64Array(90); let total = 0;
      for (const id of this.hash.query(p.x - r, p.y - r, p.x + r, p.y + r)) {
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        const a = e.pts[0], b = e.pts[e.pts.length - 1];
        if (dist({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, p) > r) continue;
        const deg = ((angleOf(a, b) / DEG) % 90 + 90) % 90, w = e.len * (e.arterial ? CFG.GRAIN_MAIN : 1);
        bins[Math.floor(deg) % 90] += w; total += w;
      }
      if (total < 150) return null;
      let best = 0, bestV = -1;
      for (let b = 0; b < 90; b++) { let v = 0; for (let d = -6; d <= 6; d++) v += bins[(b + d + 90) % 90] * (1 - Math.abs(d) / 7); if (v > bestV) { bestV = v; best = b; } }
      return (best + 0.5) * DEG;
    }
    // The nearest grid direction to h (exactly, regardless of strength), if the section has a grid.
    snapToGrid(h) {
      if (this.gridAngle === undefined || !this.gridStrength) return h;
      const q = Math.PI / 2, g = this.gridAngle;
      return g + Math.round((h - g) / q) * q;
    }
    // Pull a heading toward the nearest grid direction, by the section's grid strength.
    align(h) {
      if (!this.gridStrength) return h;
      const q = Math.PI / 2, g = this.gridAngle;
      const target = g + Math.round((h - g) / q) * q;
      return h + this.gridStrength * wrapPi(target - h);
    }
    // Where a section's clock is: 0 at its start, 1 at its end.
    progress() { return Math.min(1, Math.max(0, (this.time - this.st.start) / (this.st.end - this.st.start))); }

    // ── 4b. Graph basics ─────────────────────────────────────
    addNode(x, y) { const n = { id: this.nextId++, x, y, edges: new Set(), gate: false, bank: false }; this.nodes.set(n.id, n); return n; }
    addEdge(a, b, pts, state = 'PROVISIONAL', width = CFG.WIDTH0, sid = this.sid) {
      const e = { id: this.nextId++, a: a.id, b: b.id, pts, state, alpha: 1, width, born: this.time, sid };
      e.len = polylineLength(pts);
      this.edges.set(e.id, e); a.edges.add(e.id); b.edges.add(e.id); this.hash.add(e);
      if (!this.bySection.has(sid)) this.bySection.set(sid, new Set());
      this.bySection.get(sid).add(e.id);
      return e;
    }
    removeEdge(e, keepNodes = false) {
      this.hash.remove(e); this.edges.delete(e.id); this.fading.delete(e.id);
      this.bySection.get(e.sid)?.delete(e.id);
      for (const nid of [e.a, e.b]) {
        const n = this.nodes.get(nid); if (!n) continue;
        n.edges.delete(e.id);
        if (n.edges.size === 0 && !keepNodes) this.nodes.delete(nid);
      }
    }
    // Put a node on edge e at point P (which lies on segment i). Returns the node.
    splitEdge(e, i, P) {
      const A = this.nodes.get(e.a), B = this.nodes.get(e.b);
      if (dist(P, A) < CFG.SNAP_R) return A;
      if (dist(P, B) < CFG.SNAP_R) return B;
      const n = this.addNode(P.x, P.y);
      const p1 = e.pts.slice(0, i + 1).concat([{ x: P.x, y: P.y }]);
      const p2 = [{ x: P.x, y: P.y }].concat(e.pts.slice(i + 1));
      this.removeEdge(e, true);
      for (const [from, to, pts] of [[A, n, p1], [n, B, p2]]) {
        const ne = this.addEdge(from, to, pts, e.state, e.width, e.sid);
        ne.born = e.born; ne.alpha = e.alpha; ne.frozen = e.frozen; ne.bridge = e.bridge;
        ne.main = e.main; ne.road = e.road; ne.arterial = e.arterial; ne.netSeed = e.netSeed; ne.kind = e.kind;
        if (e.state === 'FADING') this.fading.add(ne.id);
      }
      return n;
    }
    // Undo a split: join the two streets at a degree-2 node back into one.
    mergeAt(n) {
      if (!this.nodes.has(n.id) || n.edges.size !== 2) return;
      const [e1, e2] = [...n.edges].map(id => this.edges.get(id));
      const p1 = e1.b === n.id ? e1.pts : e1.pts.slice().reverse();      // ends at n
      const p2 = e2.a === n.id ? e2.pts : e2.pts.slice().reverse();      // starts at n
      const A = this.nodes.get(e1.a === n.id ? e1.b : e1.a), B = this.nodes.get(e2.a === n.id ? e2.b : e2.a);
      this.removeEdge(e1, true); this.removeEdge(e2, true); this.nodes.delete(n.id);
      const e = this.addEdge(A, B, [p1[0], p2[p2.length - 1]], e1.state, Math.max(e1.width, e2.width), e1.sid);
      e.born = e1.born; e.alpha = e1.alpha; e.frozen = e1.frozen; e.bridge = e1.bridge;
      e.main = e1.main || e2.main; e.road = e1.road || e2.road; e.arterial = e1.arterial || e2.arterial; e.netSeed = e1.netSeed || e2.netSeed; e.kind = e1.kind || e2.kind;
    }
    degree(n) { return n.edges.size; }
    // Direction leaving node n along edge e.
    dirAt(n, e) {
      const pts = e.a === n.id ? e.pts : e.pts.slice().reverse();
      let q = pts[pts.length - 1];
      for (let i = 1; i < pts.length; i++) if (dist(pts[0], pts[i]) >= 3) { q = pts[i]; break; }
      return angleOf(pts[0], q);
    }
    isActive(e) { return e.state === 'PROVISIONAL' || e.state === 'CEMENTED'; }
    inSection(p) { return inPolys(p, this.section.poly); }
    inRiver(p) { return pointInPoly(p, this.river); }
    nearRiver(p, d) {
      if (this.inRiver(p)) return true;
      const R = this.river;
      for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
        if (distToSeg(p, { x: R[j][0], y: R[j][1] }, { x: R[i][0], y: R[i][1] }) < d) return true;
      }
      return false;
    }
    // The zone at a point (0 free, 1 floodplain, 2 resistance, 3 no-grow, 4 river).
    zoneAt(p) {
      const Z = this.zones; if (!Z) return 0;
      const i = Math.floor(p.x / Z.cell), j = Math.floor(p.y / Z.cell);
      return (i < 0 || j < 0 || i >= Z.w || j >= Z.h) ? 3 : Z.code[j * Z.w + i];
    }
    // How far inside the city p is from open land outside it, 0 (at the edge) to 1 (EDGE_THIN_PX or more).
    inwardness(p) {
      const Z = this.zones; if (!Z || !Z.edge) return 1;
      const i = Math.floor(p.x / Z.cell), j = Math.floor(p.y / Z.cell);
      const d = (i < 0 || j < 0 || i >= Z.w || j >= Z.h) ? 0 : Z.edge[j * Z.w + i];
      const k = Math.min(1, d / CFG.EDGE_THIN_PX);
      return k * k * (3 - 2 * k);
    }
    // Resistance land only takes new streets and houses where the city is already dense nearby.
    resisted(p) {
      if (this.zoneAt(p) !== 2) return false;
      // a delay, not a ban — and a shorter one in the suburbs (half as long by 18:00)
      if (this.section && this.progress() >= CFG.RESIST_UNTIL * (1 - 0.5 * (this.suburb || 0))) return false;
      const r = CFG.RESIST_R_M / CFG.M_PER_PX; let n = 0;
      for (const b of this.blocks) if (b.c && dist(b.c, p) < r && ++n >= CFG.RESIST_MIN_BLOCKS) return false;
      return true;
    }
    // Suburbs: a new street must stay within a corridor along a main road (development branches
    // off the main roads, with open land between). No rule until the section has main roads.
    inCorridor(p, h, len) {
      if (!this.suburb) return true;
      const behind = Math.max(0, Math.floor((this.time - this.st.start) / 60) - this.filled);
      const r = lerp(CFG.CORRIDOR[0], CFG.CORRIDOR[1], this.suburb) * Math.sqrt(this.blockTarget) * (1 + 1.0 * Math.max(0, behind - 1));
      if (this.hasMainRoads === undefined || this.time - (this.mainRoadsChecked || -99) > 30) {
        this.hasMainRoads = this.sectionEdges().some(e => e.arterial || e.road); this.mainRoadsChecked = this.time;
      }
      if (!this.hasMainRoads) return true;
      for (const f of [0.5, 1]) {
        const q = { x: p.x + Math.cos(h) * len * f, y: p.y + Math.sin(h) * len * f };
        if (!this.mainRoadNear(q, r)) return false;
      }
      return true;
    }
    // Is p inside one of this hour's shaded blocks? (New streets there would only split it.)
    inFilledBlock(p) {
      for (const b of this.blocks) {
        if (b.sid !== this.sid) continue;
        if (pointInPoly(p, b.ring)) return true;
        if (b.extra) for (const r of b.extra) if (pointInPoly(p, r.map(q => [q.x, q.y]))) return true;
      }
      return false;
    }
    mainRoadNear(p, r) {
      for (const id of this.hash.query(p.x - r, p.y - r, p.x + r, p.y + r)) {
        const e = this.edges.get(id);
        if (e && (e.arterial || e.road) && this.isActive(e) && distToSeg(p, e.pts[0], e.pts[e.pts.length - 1]) < r) return true;
      }
      return false;
    }
    // This section's streets that can still change.
    sectionEdges() {
      const out = [];
      for (const id of this.bySection.get(this.sid) || []) { const e = this.edges.get(id); if (e && this.isActive(e) && !e.frozen) out.push(e); }
      return out;
    }

    // Nearest crossing of the ray p→p+dir×len with an active street.
    castRay(p, ang, len, ignore = new Set()) {
      const q = { x: p.x + Math.cos(ang) * len, y: p.y + Math.sin(ang) * len };
      let best = null;
      for (const id of this.hash.query(p.x, p.y, q.x, q.y)) {
        if (ignore.has(id)) continue;
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        for (let i = 1; i < e.pts.length; i++) {
          const h = segHit(p, q, e.pts[i - 1], e.pts[i]);
          if (h && h.t * len > 0.01 && (!best || h.t < best.t)) best = { t: h.t, d: h.t * len, edge: e, seg: i - 1,
            point: { x: p.x + (q.x - p.x) * h.t, y: p.y + (q.y - p.y) * h.t } };
        }
      }
      return best;
    }
    // Distance to the nearest street piece within 30° of parallel to `ang`.
    nearestParallel(p, ang, radius, ignore = new Set()) {
      let best = Infinity;
      for (const id of this.hash.query(p.x - radius, p.y - radius, p.x + radius, p.y + radius)) {
        if (ignore.has(id)) continue;
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        for (let i = 1; i < e.pts.length; i++) {
          const a = angleOf(e.pts[i - 1], e.pts[i]);
          if (Math.abs(Math.sin(a - ang)) > Math.sin(30 * DEG)) continue;
          best = Math.min(best, distToSeg(p, e.pts[i - 1], e.pts[i]));
        }
      }
      return best;
    }
    // Junctions, gates and river ends near a point (found through the streets around it).
    nodesNear(p, r) {
      const out = new Set();
      for (const id of this.hash.query(p.x - r, p.y - r, p.x + r, p.y + r)) {
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        for (const nid of [e.a, e.b]) { const n = this.nodes.get(nid); if (n && dist(n, p) < r) out.add(n); }
      }
      return [...out];
    }

    // ── 4c. Seeds: the first footpaths, and the far bank's start ─────────
    seedDirections(from) {
      const dirs = [];
      if (this.bridgeAt) dirs.push(angleOf(from, this.bridgeAt.near) + this.rng.gauss() * 10 * DEG);
      const n = 2 + Math.floor(this.rng() * 2);
      let base = this.rng() * 2 * Math.PI;
      for (let i = 0; i < n; i++) { base += (2 * Math.PI / (n + 1)) * this.rng.range(0.7, 1.3); dirs.push(base); }
      return dirs;
    }
    // Footpaths straight out from a node to the section's edge. The node may sit right on
    // the section's edge or the river bank (the bridge landing), so the first few pixels
    // are allowed outside the section and near the water.
    seedFrom(node, dirs) {
      for (const a of dirs) {
        const p = { x: node.x + Math.cos(a) * 10, y: node.y + Math.sin(a) * 10 };
        if (!this.inSection(p) || this.inRiver(p)) continue;
        const d = 10 + this.distToEdge(p, a);
        if (Number.isFinite(d)) this.startBranch(node, a, d + 1, new Set(node.edges), { lenient: 10 });
      }
    }
    // In section 4's last minute: a street out to the bank, then the bridge across.
    buildBridge() {
      const N = this.bridgeAt.near, F = this.bridgeAt.far;
      let best = null;
      for (const id of this.hash.query(N.x - 80, N.y - 80, N.x + 80, N.y + 80)) {
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        for (let i = 1; i < e.pts.length; i++) {
          const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
          const t = Math.max(0, Math.min(1, ((N.x - a.x) * dx + (N.y - a.y) * dy) / (L || 1)));
          const P = { x: a.x + t * dx, y: a.y + t * dy }, d = dist(P, N);
          const dd = d + (this.onNetwork(e) ? 0 : 40);       // a main street, if one is about as near
          if (!best || dd < best.dd) best = { e, seg: i - 1, P, d, dd };
        }
      }
      const nearNode = this.addNode(N.x, N.y);
      if (best) {
        const from = this.splitEdge(best.e, best.seg, best.P);
        if (from !== nearNode && dist(from, nearNode) > 1) this.startBranch(from, angleOf(from, nearNode), dist(from, nearNode), new Set(from.edges), { target: nearNode, special: true });
      }
      this.farNode = this.addNode(F.x, F.y);
      this.startBranch(nearNode, angleOf(N, F), dist(N, F), new Set(), { target: this.farNode, special: true, bridge: true });
      this.events.push({ type: 'bridge', t: this.time });
    }
    seedFarBank() {
      if (!this.farNode) { this.farNode = this.addNode(this.bridgeAt.far.x, this.bridgeAt.far.y); }
      const F = this.farNode;
      // aim at the section's nearest land and its middle, and either side of the bridge's line
      let near = null;
      for (const poly of this.section.poly) for (const [x, y] of poly) { const p = { x, y }; if (!near || dist(p, F) < dist(near, F)) near = p; }
      const h = angleOf(this.bridgeAt.near, this.bridgeAt.far);
      const dirs = [angleOf(F, this.box), near ? angleOf(F, near) : h, h - 60 * DEG, h + 60 * DEG];
      let made = 0;
      for (const a0 of dirs) {
        if (made >= 3) break;
        const a = this.align(a0);
        let inAt = -1;
        for (let d = 1; d < 80; d++) {
          const p = { x: F.x + Math.cos(a) * d, y: F.y + Math.sin(a) * d };
          if (this.inRiver(p)) break;
          if (this.inSection(p)) { inAt = d; break; }
        }
        if (inAt < 0) continue;
        const p = { x: F.x + Math.cos(a) * (inAt + 2), y: F.y + Math.sin(a) * (inAt + 2) };
        const L = this.distToEdge(p, a);
        if (!Number.isFinite(L)) continue;
        this.startBranch(F, a, inAt + 2 + L, new Set(F.edges), { lenient: inAt + 3, road: true });
        made++;
      }
    }

    // ── 4d. Once a second: try to sprout one street ─────────
    tickSecond() {
      if (this.walkerOnly()) return;
      if (!this.isOrganic() && !this.finished && this.sid !== this.firstFar) return;   // version 2: cut streets instead
      this.cache = null;                        // lists rebuilt at most once a second
      if (this.budget <= 0) return;             // paced: wait for the budget to refill
      for (let attempt = 0; attempt < 10; attempt++) {
        const s = this.pickSpawn(); if (!s) continue;
        if (this.tryStart(s)) { this.stats.spawned++; return; }
      }
      this.stats.rejected++;
    }
    lists() {
      if (this.cache) return this.cache;
      const edges = this.sectionEdges(), nodes = new Set();
      for (const e of edges) { nodes.add(this.nodes.get(e.a)); nodes.add(this.nodes.get(e.b)); }
      const front = this.frontRadius();
      const inFront = p => dist(p, this.origin) <= front;
      const tips = [], crossings = [], banks = [];
      for (const n of nodes) {
        if (!n) continue;
        const d = this.degree(n);
        if (d === 1 && !n.gate && !n.bank && this.inSection(n)) tips.push(n);
        if (n.bank && n.riverside && d <= 2) banks.push(n);
        if (d === 3 && !n.gate && inFront(n)) {
          const es = [...n.edges].map(id => this.edges.get(id));
          if (es.some(e => !this.isActive(e))) continue;
          const dd = es.map(e => this.dirAt(n, e));
          for (let i = 0; i < 3; i++) {            // the other two must run nearly straight through
            if (Math.abs(wrapPi(dd[(i + 1) % 3] - dd[(i + 2) % 3])) > 150 * DEG) { crossings.push({ n, heading: dd[i] + Math.PI }); break; }
          }
        }
      }
      const entries = this.entries.filter(n => this.nodes.has(n.id) && n.edges.size === 1);
      this.cache = { edges: edges.filter(e => e.len >= 2 * CFG.MIN_SEG), tips, crossings, banks, entries, inFront };
      return this.cache;
    }
    pickSpawn() {
      const s = this.pickSpawnRaw();
      if (s && !s.riverside) {
        s.heading = this.align(s.heading);
        // Wobble after the pull, shrinking as the grid strengthens. Without it, each street square
        // to an aligned parent is aligned too, and a partial pull locks into a full grid within an hour.
        const g = this.gridStrength || 0;
        if (this.t >= CFG.ORGANIC_UNTIL) s.heading += this.rng.gauss() * lerp(CFG.WOBBLE[0], CFG.WOBBLE[1], g) * DEG;
      }
      return s;
    }
    pickSpawnRaw() {
      const L = this.lists(), r = this.rng();
      const jitter = s => this.rng.gauss() * this.T.jDev * s * DEG;
      if (L.entries.length && r < CFG.P_ENTRY) {           // carry a street on from an earlier section
        const n = L.entries[Math.floor(this.rng() * L.entries.length)];
        const e = this.edges.get([...n.edges][0]);
        return { node: n, heading: this.dirAt(n, e) + Math.PI + jitter(0.3) };
      }
      if (!L.edges.length) return this.fallbackSpawn();
      const q = this.rng();
      if (L.tips.length && q < this.pTip) {                // extend a dead end
        const n = L.tips[Math.floor(this.rng() * L.tips.length)];
        const e = this.edges.get([...n.edges][0]);
        return { node: n, heading: this.dirAt(n, e) + Math.PI + jitter(0.5) };
      }
      if (L.crossings.length && q < this.pTip + this.T.fourWay) {   // make a crossroads
        const x = L.crossings[Math.floor(this.rng() * L.crossings.length)];
        return { node: x.n, heading: x.heading + jitter(0.3) };
      }
      if (this.touchesRiver && L.banks.length && q < this.pTip + this.T.fourWay + CFG.P_RIVERSIDE) {
        const x = this.pickRiverside(L.banks);
        if (x) return x;
      }
      // A point on one of this section's streets, favouring those inside the growth front.
      const w = e => e.len * (L.inFront(e.pts[0]) ? 1 : 0.1);
      let total = 0; for (const e of L.edges) total += w(e);
      let rr = this.rng() * total, e = L.edges[0];
      for (const c of L.edges) { rr -= w(c); if (rr <= 0) { e = c; break; } }
      const at = this.rng.range(CFG.MIN_SEG, e.len - CFG.MIN_SEG);
      let s = at;
      for (let i = 1; i < e.pts.length; i++) {
        const Lg = dist(e.pts[i - 1], e.pts[i]);
        if (s <= Lg) {
          const f = s / Lg, a = e.pts[i - 1], b = e.pts[i];
          const point = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
          if (!this.inSection(point)) return null;
          const side = this.rng() < 0.5 ? 1 : -1;
          const heading = angleOf(a, b) + side * Math.PI / 2 + jitter(1);
          return { edge: e, seg: i - 1, point, heading, cul: this.rng() < this.pCul };
        }
        s -= Lg;
      }
      return null;
    }
    // A section that no street reaches yet: footpaths in from the three nearest junctions.
    walkIn() {
      const cands = [...this.nodes.values()].filter(n => n.edges.size >= 1 && !this.inSection(n))
        .map(n => ({ n, d: dist(n, this.box) })).sort((a, b) => a.d - b.d);
      let made = 0;
      for (const { n } of cands) {
        if (made >= 3) break;
        const h = this.align(angleOf(n, this.box));
        let inAt = -1;
        for (let d = 1; d < 80; d++) {
          const p = { x: n.x + Math.cos(h) * d, y: n.y + Math.sin(h) * d };
          if (this.nearRiver(p, this.riverBuffer)) break;
          if (this.inSection(p)) { inAt = d; break; }
        }
        if (inAt < 0) continue;
        const p = { x: n.x + Math.cos(h) * (inAt + 2), y: n.y + Math.sin(h) * (inAt + 2) };
        const d = this.distToEdge(p, h);
        if (!Number.isFinite(d)) continue;
        this.startBranch(n, h, inAt + 2 + d, new Set(n.edges), { lenient: inAt + 3 });
        made++;
      }
    }
    // Nothing to grow from yet: head in from the nearest existing street end.
    fallbackSpawn() {
      let best = null;
      for (const n of this.nodes.values()) {
        if (!n.edges.size) continue;
        const d = dist(n, this.box);
        if (!best || d < best.d) best = { n, d };
      }
      if (!best) return null;
      return { node: best.n, heading: angleOf(best.n, this.box) + this.rng.gauss() * 20 * DEG };
    }
    // Two streets that both stopped at the river: link them with a straight street along the
    // bank, if the line between them stays clear of the water.
    pickRiverside(banks) {
      const A = banks[Math.floor(this.rng() * banks.length)];
      const others = [...this.nodes.values()].filter(n => n.bank && n !== A && dist(n, A) < this.maxReach * 1.5 && dist(n, A) > CFG.MIN_SEG)
        .sort((p, q) => dist(p, A) - dist(q, A)).slice(0, 3);
      for (const B of others) {
        let clear = true;
        for (const f of [0.25, 0.5, 0.75]) {
          const m = { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f };
          if (this.nearRiver(m, this.riverBuffer * 0.8)) { clear = false; break; }
        }
        if (clear) return { node: A, heading: angleOf(A, B), riverside: true };
      }
      return null;
    }
    // Check a proposed street and, if it passes, start growing it. Returns true if started.
    tryStart(s) {
      const plan = this.spawnIsLegal(s);
      if (!plan) return false;
      const firstNewId = this.nextId, made = [];
      let node = s.node;
      if (!node) { node = this.splitEdge(s.edge, s.seg, s.point); if (node.id >= firstNewId) made.push(node); }
      // If it will join another street, try it out first: add it for a moment, look at the
      // blocks on either side, and take it away again. Too small a block → don't start it.
      if (plan.hit) {
        const target = this.edges.get(plan.hit.edge.id);
        let ok = !!target;
        if (ok) {
          const end = this.splitEdge(target, plan.hit.seg, plan.hit.point);
          if (end.id >= firstNewId && end !== node) made.push(end);
          if (end === node) ok = false;
          else {
            const tmp = this.addEdge(node, end, [{ x: node.x, y: node.y }, { x: end.x, y: end.y }]);
            const { faceOf } = this.findFaces(this.localArea(node, end));
            for (const k of [tmp.id + ':' + tmp.a, tmp.id + ':' + tmp.b]) {
              const f = faceOf.get(k);
              if (f && f.area < this.minBlock) ok = false;
            }
            this.removeEdge(tmp, true);
          }
        }
        if (!ok) { for (const n of made.reverse()) this.mergeAt(n); return false; }
      }
      if (this.thicken && s.edge) {             // later sections: using a street widens it
        for (const id of node.edges) { const e = this.edges.get(id); if (!e.frozen) e.width = Math.min(CFG.WIDTH_MAX, e.width + CFG.WIDTH_USE); }
      }
      this.startBranch(node, s.heading, plan.len, new Set(node.edges));
      this.budget -= plan.len;
      return true;
    }

    // The growth front: spreads from the section's inner edge (or the bridge) to its far edge.
    frontRadius() {
      const p = this.progress();
      if (this.isOrganic && this.isOrganic()) {           // walker.py: grows linearly, stage by stage
        // (It reaches the section's edge by stage FRONT_FULL, leaving the last stages to fill in,
        //  so each section is built out within its hour.)
        const stage = Math.min(WALK.stages, Math.floor(p * WALK.stages) + 1);
        return this.frontFrom + Math.max(60 / CFG.M_PER_PX, (this.extent - this.frontFrom) * Math.min(1, stage / WALK.frontFull));
      }
      return this.frontFrom + (this.extent - this.frontFrom) * (CFG.FRONT_START + (1 - CFG.FRONT_START) * p);
    }
    // Distance along a heading to the edge of the section (Infinity if it never gets there).
    distToEdge(p, ang) {
      const L = 2000;
      const q = { x: p.x + Math.cos(ang) * L, y: p.y + Math.sin(ang) * L };
      let best = Infinity;
      for (const poly of this.section.poly) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const h = segHit(p, q, { x: poly[j][0], y: poly[j][1] }, { x: poly[i][0], y: poly[i][1] });
          if (h && h.t * L > 0.5) best = Math.min(best, h.t * L);
        }
      }
      return best;
    }

    // A sprout is legal only if it heads for something: another street within maxReach,
    // or else the section's edge (a gate for the next section) or the river bank.
    // A cul-de-sac is the exception: it stops short on purpose.
    // Returns { len, hit } (hit = the street it will join), or 0.
    spawnIsLegal(s) {
      const p = s.node ? s.node : s.point;
      if (!this.inSection(p) && !s.node) return 0;
      // A street from a node on or outside the section's edge must head into the section.
      if (s.node && !this.inSection({ x: p.x + Math.cos(s.heading) * 3, y: p.y + Math.sin(s.heading) * 3 })) return 0;
      if (this.inRiver(p)) return 0;
      const dirs = s.node ? [...s.node.edges].map(id => this.dirAt(s.node, this.edges.get(id)))
                          : [angleOf(s.edge.pts[s.seg], s.edge.pts[s.seg + 1]), angleOf(s.edge.pts[s.seg + 1], s.edge.pts[s.seg])];
      for (const d of dirs) if (Math.abs(wrapPi(d - s.heading)) < CFG.MIN_ANGLE * DEG) return 0;
      const ignore = s.node ? new Set(s.node.edges) : new Set([s.edge.id]);
      const parallelOk = len => [0.35, 0.65].every(f => {
        const q = { x: p.x + Math.cos(s.heading) * len * f, y: p.y + Math.sin(s.heading) * len * f };
        return this.nearestParallel(q, s.heading, this.junctionGap, ignore) >= this.junctionGap;
      });
      if (s.cul) {                                 // a cul-de-sac: short, and touching nothing
        const len = this.segLenPx * this.rng.range(0.7, 1.2);
        if (this.castRay(p, s.heading, len + 0.5 * this.junctionGap, ignore)) return 0;
        if (this.distToEdge(p, s.heading) < len + 3) return 0;
        if (this.touchesRiver && this.nearRiver({ x: p.x + Math.cos(s.heading) * len, y: p.y + Math.sin(s.heading) * len }, this.riverBuffer + 3)) return 0;
        if (this.resisted({ x: p.x + Math.cos(s.heading) * len, y: p.y + Math.sin(s.heading) * len })) return 0;
        if (!this.inCorridor(p, s.heading, len)) return 0;
        return parallelOk(len) ? { len, hit: null } : 0;
      }
      let hit = this.castRay(p, s.heading, this.maxReach, ignore);
      let edge = this.distToEdge(p, s.heading);
      const joinable = h => h && h.d <= edge + 2 * CFG.SNAP_R;   // just across the edge is fine
      // Landing near a junction, or a street end at the edge or the bank? Tilt to land on it.
      if (joinable(hit)) {
        let best = null, bd = CFG.AIM_R * this.junctionGap;
        for (const n of this.nodesNear(hit.point, bd)) {
          if (n === s.node || !(this.degree(n) >= 3 || n.gate || n.bank)) continue;
          const d = dist(n, hit.point);
          if (d > CFG.SNAP_R * 0.5 && d < bd) { bd = d; best = n; }
        }
        if (best) {
          const h = angleOf(p, best);
          if (Math.abs(wrapPi(h - s.heading)) <= CFG.AIM_MAX * (1 - 0.7 * (this.gridStrength || 0)) * DEG) {
            const h2 = this.castRay(p, h, this.maxReach, ignore);
            const arrive = h + Math.PI;
            const clear = [...best.edges].every(id =>
              Math.abs(wrapPi(this.dirAt(best, this.edges.get(id)) - arrive)) >= CFG.MIN_ANGLE * DEG);
            if (h2 && dist(h2.point, best) < CFG.SNAP_R && clear &&
                dirs.every(d => Math.abs(wrapPi(d - h)) >= CFG.MIN_ANGLE * DEG)) {
              s.heading = h; hit = h2; edge = this.distToEdge(p, h);
            }
          }
        }
      }
      let len, reach, joins = false;
      if (joinable(hit)) { reach = hit.d; len = hit.d + CFG.SNAP_R; joins = true; }
      else if (Number.isFinite(edge)) {
        reach = edge; len = edge + 1;
        // Reaching the river rather than another section: stop short of the water.
        const at = { x: p.x + Math.cos(s.heading) * edge, y: p.y + Math.sin(s.heading) * edge };
        if (this.touchesRiver && this.nearRiver(at, this.riverBuffer + 3)) { len = edge - this.riverBuffer; reach = len; }
      } else return 0;
      if (reach < CFG.MIN_SEG) return 0;
      if (joins) {
        // It must meet the other street at a decent angle, not glance off it…
        const t = angleOf(hit.edge.pts[hit.seg], hit.edge.pts[hit.seg + 1]);
        if (Math.abs(Math.sin(t - s.heading)) < Math.sin(CFG.MIN_ANGLE * DEG)) return 0;
        // …and either land on an existing junction or well clear of one.
        const A = this.nodes.get(hit.edge.a), B = this.nodes.get(hit.edge.b);
        const dj = Math.min(dist(hit.point, A), dist(hit.point, B));
        if (dj >= CFG.SNAP_R && dj < this.junctionGap * 0.5) return 0;
      }
      if (!parallelOk(len)) return 0;
      for (const f of [0.5, 1]) if (this.resisted({ x: p.x + Math.cos(s.heading) * len * f, y: p.y + Math.sin(s.heading) * len * f })) return 0;
      if (!this.inCorridor(p, s.heading, len)) return 0;
      if (this.rng() < CFG.EDGE_THIN * (1 - this.inwardness({ x: p.x + Math.cos(s.heading) * len, y: p.y + Math.sin(s.heading) * len }))) return 0;
      if (this.inFilledBlock({ x: p.x + Math.cos(s.heading) * len * 0.5, y: p.y + Math.sin(s.heading) * len * 0.5 })) return 0;
      return { len, hit: joins ? hit : null };
    }

    // ── 4e. Growing streets ──────────────────────────────────
    startBranch(node, heading, len, ignore, extra = {}) {
      this.growing.push(Object.assign({
        seq: (this.seq = (this.seq || 0) + 1),
        start: node, pts: [{ x: node.x, y: node.y }], heading, len, grown: 0, ignore,
        speed: Math.max(len, 12) / (extra.bridge ? 3 * CFG.GROW_TIME : CFG.GROW_TIME),
      }, extra));
    }
    update(dt) {
      for (const b of this.growing.slice()) {
        let d = b.speed * dt;
        while (d > 0 && !b.done) { const s = Math.min(CFG.STEP, d); this.stepBranch(b, s); d -= s; }
      }
      this.growing = this.growing.filter(b => !b.done);
      for (const id of [...this.fading]) {
        const e = this.edges.get(id); if (!e) { this.fading.delete(id); continue; }
        e.alpha -= dt / CFG.FADE_TIME;
        if (e.alpha <= 0) this.removeEdge(e);
      }
      if (this.events.length > 50) this.events = this.events.slice(-50);
    }
    // Streets are straight: the heading never changes while a street grows.
    stepBranch(b, s) {
      if (b.planned !== undefined) return this.stepPlanned(b, s);
      const tip = b.pts[b.pts.length - 1];
      if (b.special) {                         // the bridge and its approach: straight to the target
        const next = { x: tip.x + Math.cos(b.heading) * s, y: tip.y + Math.sin(b.heading) * s };
        b.pts.push(next); b.grown += s;
        if (b.grown >= b.len) this.finish(b, b.target, 'special');
        return;
      }
      // Look ahead one step plus the snap radius: anything in that span is joined.
      // (Right at the start, ignore the street it sprouted from.)
      const hit = this.castRay(tip, b.heading, s + CFG.SNAP_R, b.grown < 3 ? b.ignore : new Set());
      if (hit) return this.finishAtHit(b, hit);
      const next = { x: tip.x + Math.cos(b.heading) * s, y: tip.y + Math.sin(b.heading) * s };
      // Another street still growing across our path (it isn't a street yet, so the look-ahead
      // can't see it): stop here rather than cross it.
      for (const o of this.growing) {
        if (o === b || o.done || o.start === b.start) continue;
        const oa = o.pts[0], ob = o.pts[o.pts.length - 1];
        if (segHit(tip, next, oa, ob)) return this.finish(b, null, 'dead');
      }
      if (b.free) {                           // dusk: out past the edge, where no section applies
        const wet = this.nearRiver(next, this.riverBuffer);
        if (wet || !this.outsideCity(next)) return this.finish(b, null, wet ? 'bank' : 'dead');
        b.pts.push(next); b.grown += s;
        if (b.grown >= b.len) this.finish(b, null, 'dead');
        return;
      }
      if (!this.section) return this.finish(b, null, 'dead');   // still growing when dusk began: stop here
      const lenient = b.lenient && b.grown < b.lenient;
      if (!lenient && this.touchesRiver && this.nearRiver(next, this.riverBuffer)) return this.finish(b, null, 'bank');
      if (!lenient && !this.inSection(next)) {
        // The section's edge: stop exactly where the street's own line meets it, as a gate.
        // (The edge must be within this step; if the tip is somehow already outside, stop here.)
        const d = this.distToEdge(tip, b.heading);
        const at = Number.isFinite(d) && d <= s + 1 ? { x: tip.x + Math.cos(b.heading) * d, y: tip.y + Math.sin(b.heading) * d } : tip;
        return this.finish(b, at, 'gate');
      }
      b.pts.push(next); b.grown += s;
      if (b.grown >= b.len) this.finish(b, null, 'dead');
    }
    finishAtHit(b, hit) {
      const end = this.splitEdge(hit.edge, hit.seg, hit.point);
      if (end === b.start) { b.done = true; return; }
      const e = this.finish(b, end, 'hit');
      // Sometimes carry straight on through the junction to make a crossroads.
      if (e && !this.finished && this.rng() < this.T.fourWay) this.tryStart({ node: end, heading: b.heading });
    }
    finish(b, endNode, kind) {
      b.done = true;
      const pts = b.pts.slice();
      let end = endNode;
      if (end) pts.push({ x: end.x, y: end.y });
      // (a planned street keeps even its shortest piece: dropping one would break the road in two)
      if (pts.length < 2 || polylineLength(pts) < (b.planned !== undefined ? 0.05 : CFG.MIN_SEG * 0.6)) return null;
      if (kind === 'gate') { end = this.addNode(endNode.x, endNode.y); end.gate = true; }
      if (!end) {
        const t = pts[pts.length - 1]; end = this.addNode(t.x, t.y);
        if (kind === 'bank') { end.bank = true; end.riverside = this.rng() < CFG.RIVERSIDE_SHARE; }
        if (b.free && kind === 'dead') end.outskirt = b.depth || 1;   // how many pushes out (max 3)
      }
      if (!this.nodes.has(b.start.id)) return null;       // start faded away meanwhile
      const e = this.addEdge(b.start, end, [{ x: b.start.x, y: b.start.y }, { x: end.x, y: end.y }],
        b.special ? 'CEMENTED' : 'PROVISIONAL', b.bridge ? 1.6 : CFG.WIDTH0);
      if (b.bridge) e.bridge = true;
      if (b.road || b.special) { e.road = true; e.netSeed = true; }   // the bridge, its approach, the far bank's first paths
      // Where the growing tip actually was. If snapping to the node moved the end, the
      // renderer uses this to widen the street over the gap instead of letting it jump.
      const tip = b.pts[b.pts.length - 1];
      if (dist(tip, end) > 0.3) e.snap = { from: { x: tip.x, y: tip.y }, t: this.time };
      if (b.planned !== undefined) {
        const plan = this.plans[b.planned];
        e.main = plan.kind !== 'lane';
        e.kind = plan.kind + (plan.ck ? ':' + plan.ck : '');
        if (plan.kind === 'trail') e.road = true;                       // an old road (walker trail)
        if (plan.kind === 'thoroughfare') { e.road = true; e.arterial = true; e.width = Math.max(e.width, plan.width || e.width); }
        return e;
      }
      if (!b.special) this.checkNewStreet(e);
      return e;
    }

    // ── 4f. Blocks: faces of the street graph ────────────────
    // Pass `near` = {x, y, r} to look only at streets around one spot.
    findFaces(near = null) {
      const pool = near
        ? [...this.hash.query(near.x - near.r, near.y - near.r, near.x + near.r, near.y + near.r)].map(id => this.edges.get(id))
        : [...this.edges.values()];
      const act = pool.filter(e => e && this.isActive(e) && e.a !== e.b);
      // Keep only the "2-core": repeatedly drop dead ends, which can't bound a block.
      const deg = new Map(), inc = new Map();
      for (const e of act) for (const n of [e.a, e.b]) {
        deg.set(n, (deg.get(n) || 0) + 1);
        if (!inc.has(n)) inc.set(n, []);
        inc.get(n).push(e);
      }
      const alive = new Set(act.map(e => e.id));
      const queue = [...deg.keys()].filter(n => deg.get(n) === 1);
      while (queue.length) {
        const n = queue.pop();
        for (const e of inc.get(n)) if (alive.has(e.id)) {
          alive.delete(e.id);
          const o = e.a === n ? e.b : e.a;
          deg.set(o, deg.get(o) - 1); deg.set(n, deg.get(n) - 1);
          if (deg.get(o) === 1) queue.push(o);
        }
      }
      const out = new Map();
      for (const id of alive) {
        const e = this.edges.get(id);
        for (const [from, to] of [[e.a, e.b], [e.b, e.a]]) {
          if (!out.has(from)) out.set(from, []);
          out.get(from).push({ e, to, ang: this.dirAt(this.nodes.get(from), e) });
        }
      }
      for (const list of out.values()) list.sort((p, q) => p.ang - q.ang);
      const seen = new Set(), faces = [], faceOf = new Map();
      for (const [from, list] of out) for (const h0 of list) {
        const k0 = h0.e.id + ':' + from;
        if (seen.has(k0)) continue;
        const pts = [], keys = [];
        let cur = { e: h0.e, from, to: h0.to }, guard = 0;
        while (guard++ < 5000) {
          const key = cur.e.id + ':' + cur.from;
          if (seen.has(key)) break;
          seen.add(key); keys.push(key);
          const seg = cur.e.a === cur.from ? cur.e.pts : cur.e.pts.slice().reverse();
          for (let i = 0; i < seg.length - 1; i++) pts.push(seg[i]);
          const list2 = out.get(cur.to);
          const idx = list2.findIndex(h => h.e === cur.e && h.to === cur.from);
          const nx = list2[(idx + 1) % list2.length];
          cur = { e: nx.e, from: cur.to, to: nx.to };
        }
        if (pts.length < 3) continue;
        // With y pointing down, enclosed faces have negative signed area; the outside is positive.
        const area = -signedArea(pts);
        if (area <= 0) continue;
        const f = { pts, area, keys, c: centroid(pts), edgeIds: new Set(keys.map(k => +k.split(':')[0])) };
        faces.push(f);
        for (const k of keys) faceOf.set(k, f);
      }
      return { faces, faceOf };
    }
    // A just-finished street that closes a loop must leave both sides at least block-sized.
    checkNewStreet(e) {
      const A = this.nodes.get(e.a), B = this.nodes.get(e.b);
      const mid = e.pts[Math.floor(e.pts.length / 2)];
      const inBlock = this.blocks.some(bl => pointInPoly(mid, bl.ring));
      const deadEnd = (this.degree(A) === 1 && !A.gate) || (this.degree(B) === 1 && !B.gate);
      if (deadEnd) { if (inBlock) this.fade(e); return; }
      const { faceOf } = this.findFaces(this.localArea(A, B));
      for (const k of [e.id + ':' + e.a, e.id + ':' + e.b]) {
        const f = faceOf.get(k);
        if (f && f.area < this.minBlock) { this.fade(e); return; }
      }
    }
    localArea(p, q) {
      return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, r: dist(p, q) / 2 + 2 * Math.sqrt(this.minBlock) + 10 };
    }
    fade(e) { if (e.state !== 'FADING' && !e.frozen) { e.state = 'FADING'; this.fading.add(e.id); this.stats.faded++; } }

    // ── 4g. Once a minute: a block, or a main road widens ────
    // Once a minute: the growing section's block count catches up to the minute, so reading
    // the count tells the time. A block can take in a few neighbouring small areas (see
    // fillBlock), so 60 of them cover most of the section. If nothing is enclosed yet the
    // block is owed and filled as soon as there's room; near the end of the hour any shape goes.
    tickMinute(minuteInSection) {
      const st = this.st, m = minuteInSection;
      let got = false;
      if (m >= st.minutes - 15) this.ensureSquare(false);
      else if (m >= 10 && this.isOrganic()) this.ensureSquare(true);   // a village rarely gets enclosed: take a decent area near it early
      for (let k = 0; k < 6 && this.filled < m; k++) {
        const behind = m - this.filled;
        const anyShape = behind > 2 || m > st.minutes - 10;
        if (!this.fillBlock(m, anyShape)) break;
        got = true;
      }
      // Still behind with nothing left to fill: an earlier block of this hour that took in extra
      // areas gives one up, which becomes this minute's block (the shading doesn't change).
      while (this.filled < m && this.splitOffBlock()) got = true;
      if (this.thicken && m % CFG.WIDEN_EVERY === 0) this.widenMainRoad();
      if (!got) this.prune(this.box, this.box.r);  // tidy the whole section
      const next = this.schedule[this.stage + 1];
      if (next && next.id === this.firstFar && m === st.minutes - 1) this.buildBridge();
      // The edges earlier hours left ragged: carry their loose street ends on, shade the ground that closes.
      if (m === st.minutes) this.tidyStubs(true); else if (m % 5 === 0) this.tidyStubs(false);
      this.fillSeams(m === 1 || m === st.minutes);
    }
    // ── 4g′. Seams and loose ends ────────────────────────────
    blockBox(b) {
      let bb = this.bbCache.get(b); const n = b.extra ? b.extra.length : 0;
      if (!bb || bb.n !== n) {
        bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n };
        for (const r of [b.pts, ...(b.extra || [])]) for (const q of r) { bb.x0 = Math.min(bb.x0, q.x); bb.y0 = Math.min(bb.y0, q.y); bb.x1 = Math.max(bb.x1, q.x); bb.y1 = Math.max(bb.y1, q.y); }
        this.bbCache.set(b, bb);
      }
      return bb;
    }
    // The block shading point p, if any (counted: only one of an hour's blocks, not seam ground).
    blockAt(p, counted = false) {
      for (const b of this.blocks) {
        if (counted && b.sid === 'seam') continue;
        const bb = this.blockBox(b); if (p.x < bb.x0 || p.x > bb.x1 || p.y < bb.y0 || p.y > bb.y1) continue;
        if (inRingPts(p, b.pts)) return b;
        if (b.extra) for (const r of b.extra) if (inRingPts(p, r)) return b;
      }
      return null;
    }
    finishedSectionAt(p) {
      for (let k = 0; k < this.stage; k++) if (inPolys(p, this.sections[this.schedule[k].id].poly)) return k;
      return -1;
    }
    // Ground inside a finished section that streets have since closed off — the ragged edge an hour
    // leaves, enclosed when the next hour builds up to it — is shaded as it closes: built-up ground,
    // not one of any hour's 60 blocks (sid 'seam'; `of` = the hour it closed in). A hub's square stays
    // open, and so do a suburb section's empty lots.
    fillSeams(whole) {
      if (this.stage < 1) return;
      const seen = this.seamSeen || (this.seamSeen = new Set());       // (areas already looked at this hour — not saved: looking again gives the same answer)
      // (the areas this minute's block was chosen from will do, if any street since gone is allowed for)
      const fresh = whole || !this.facesNow || this.facesNow.sub !== this.sub;
      for (const f of fresh ? this.findFaces(whole ? null : this.box).faces : this.facesNow.faces) {
        if (f.area < CFG.SEAM_MIN) continue;
        const key = f.key || [...f.edgeIds].sort((a, b) => a - b).join(',');
        if (seen.has(key) || this.filledKeys.has(key)) continue;
        if (!fresh) { let gone = false; for (const id of f.edgeIds) { const e = this.edges.get(id); if (!e || !this.isActive(e)) { gone = true; break; } } if (gone) continue; }
        const at = interiorPoint(f.pts), k = this.finishedSectionAt(at);
        if (k < 0) continue;                                           // in the growing section: its own blocks' business
        seen.add(key);
        const st = this.schedule[k], suburb = (st.t - CFG.SUBURB_FROM) / (1 - CFG.SUBURB_FROM) > 0;
        if (f.area > (suburb ? CFG.SEAM_SUBURB * this.blockArea : 2.5 * this.maxBlock)) continue;
        if (this.inSquare(f) || this.blockAt(at)) continue;
        if (this.blocks.some(b => inRingPts(b.c, f.pts))) continue;    // an outline that wraps round blocks isn't an empty area
        this.blocks.push({ pts: f.pts.map(q => ({ x: q.x, y: q.y })), ring: f.pts.map(q => [q.x, q.y]), area: f.area, c: f.c, born: this.time, sid: 'seam', of: this.sid });
        this.filledKeys.add(key);
        for (const id of f.edgeIds) { const e = this.edges.get(id); if (e && !e.frozen) e.state = 'CEMENTED'; }
      }
    }
    // A street left ending in mid-air (most are streets that stopped at their section's edge, waiting
    // for the next hour) once the ground ahead of it has been built: it carries straight on to the
    // next street if that is close and the way is clear; at the hour's end, one that couldn't is taken
    // away, back to the last junction. Left alone: main roads, walls, the suburbs' spurs, river ends,
    // and ends facing a section due within two hours or open country (those hours, or dusk, carry them on).
    tidyStubs(final) {
      const reach = CFG.STUB_REACH * Math.sqrt(this.blockArea), planned = !this.isOrganic() && this.sid !== this.firstFar;
      const fixed = e => e.bridge || e.netSeed || e.kind === 'wall' || e.kind === 'cut:spur';
      const live = n => { const out = []; for (const id of n.edges) { const x = this.edges.get(id); if (x && this.isActive(x)) out.push(x); } return out; };
      const busy = new Set(this.growing.map(b => b.start && b.start.id));
      for (const n of [...this.nodes.values()]) {
        if (n.bank || busy.has(n.id) || !this.nodes.has(n.id)) continue;
        const own = live(n); if (own.length !== 1) continue;
        const e = own[0];
        const art = !!e.arterial;                                      // a main road is never taken away: it is carried on if it can be, further than a side street
        if (fixed(e) || (!final && (art || !e.frozen))) continue;      // (mid-hour, the growing section's own streets are still being drawn)
        const h = this.dirAt(n, e) + Math.PI, step = k => ({ x: n.x + Math.cos(h) * k, y: n.y + Math.sin(h) * k }), ahead = step(4);
        let never = !this.inAnySection(ahead) && !this.outsideCity(ahead);             // water, high ground, the map's edge
        if (!never && !this.inSection(ahead) && this.finishedSectionAt(ahead) < 0) {
          // Facing ground still to be built. Worth waiting for if that is soon (it can then be carried on
          // into the new streets); a planned section hours away would leave it hanging all that time.
          let kf = -1;
          for (let k = this.stage + 1; k < this.schedule.length; k++) if (inPolys(ahead, this.sections[this.schedule[k].id].poly)) { kf = k; break; }
          if (!final || kf < 0 || kf - this.stage <= 2) continue;
          never = true;
        }
        const hit = never ? null : this.castRay(n, h, reach * (art ? 2.5 : 1), new Set(n.edges));
        let ok = !!hit && hit.d >= 0.2 && !hit.edge.bridge && this.isActive(hit.edge);
        // not across water or high ground, not through one of an hour's blocks, and in a planned hour
        // not through its own cells either (a slanting line across a regular block)
        if (ok) for (let k = 2; k < hit.d - 0.5; k += 3) {
          const q = step(k);
          if (this.zoneAt(q) === 3 || this.inRiver(q) || this.blockAt(q, true) || (planned && !art && k > 6 && this.finishedSectionAt(q) < 0)) { ok = false; break; }
        }
        if (ok) {
          const end = this.splitEdge(hit.edge, hit.seg, hit.point);
          if (end !== n && !own.some(x => x.a === end.id || x.b === end.id)) {
            const ne = this.addEdge(n, end, [{ x: n.x, y: n.y }, { x: end.x, y: end.y }], 'CEMENTED', e.width, this.sid);
            ne.kind = 'join'; n.gate = false;
            if (art) { ne.arterial = ne.road = ne.main = true; }
            continue;
          }
        }
        if (!final || art) continue;
        let cur = e, tip = n;
        for (let guard = 0; cur && guard < 8; guard++) {
          const o = this.nodes.get(cur.a === tip.id ? cur.b : cur.a);
          cur.frozen = false; this.fade(cur);
          const rest = o ? live(o) : [];
          cur = (rest.length === 1 && !o.bank && !fixed(rest[0]) && !rest[0].arterial) ? rest[0] : null; tip = o;
        }
      }
    }
    // The hour's square. Every odd hour has a hub (05:00 the market, 07:00 a village, 09:00–17:00 the
    // day's hubs): the enclosed area holding it is left open — never a block — so the squares can be
    // counted like the hours on a dial. True if face f is this hour's square.
    squareFace(f) {
      if (this.inSquare(f)) return true;
      const p = this.squareAt[this.sid];
      if (!p || this.squares.some(x => x.sid === this.sid)) return false;
      if (f.area > 2.5 * this.maxBlock || !inRingPts(p, f.pts)) return false;
      // (in the old city the area round the hub can be a scrap: then ensureSquare picks a better one close by)
      if (this.isOrganic() && (f.area < CFG.SQUARE_MIN * this.blockArea || f.area > CFG.SQUARE_MAX * this.blockArea)) return false;
      this.openSquare(f); return true;
    }
    // A square keeps the outline it opened with: whatever lies inside it stays open, even if a later
    // street crosses it.
    openSquare(f) {
      const sq = { sid: this.sid, born: this.time, pts: f.pts.map(q => ({ x: q.x, y: q.y })), c: interiorPoint(f.pts), area: f.area };
      this.squares.push(sq); this.events.push({ type: 'square', square: sq, t: this.time });
    }
    inSquare(f) {
      for (const sq of this.squares) if (sq.pts && (inRingPts(sq.c, f.pts) || inRingPts(f.c, sq.pts))) return true;
      return false;
    }
    // An hour whose hub still sits on open ground (a village usually does — trails meet there): an
    // empty enclosed area near it becomes the square. Choosy (from minute 10 in the old city): one a
    // little larger than the hour's blocks, close by; otherwise (the hour's last 15 minutes) the best there is.
    ensureSquare(choosy) {
      const p = this.squareAt[this.sid];
      if (!p || this.squares.some(x => x.sid === this.sid)) return;
      let best = null;
      for (const f of this.findFaces(this.box).faces) {
        if (!this.inSection(f.c) || f.area < (choosy ? CFG.SQUARE_MIN * this.blockArea : this.minBlock) || f.area > (choosy ? CFG.SQUARE_MAX * this.blockArea : this.maxBlock)) continue;
        if (choosy && dist(f.c, p) > 90) continue;
        f.key = [...f.edgeIds].sort((a, b) => a - b).join(',');
        if (this.filledKeys.has(f.key) || this.inFilledBlock(f.c) || this.inSquare(f)) continue;
        const d = dist(f.c, p) - 1.5 * Math.sqrt(f.area);            // near the hub, and not a scrap
        if (!best || d < best.d) best = { f, d };
      }
      if (best) { this.squareAt[this.sid] = interiorPoint(best.f.pts); this.openSquare(best.f); }
    }
    // A block has just been counted: its number in the hour, and the quarter marks (the 15th, 30th
    // and 45th blocks are drawn a shade deeper, so the minutes read as quarters plus a few).
    countBlock(block) {
      block.n = this.filled;
      const due = this.filled % 15 === 0 && this.filled < this.quota;
      if (block.sub) { if (due) this.quarterOwed = true; return; }     // (a hidden block: the next one shown carries the mark)
      if (due || this.quarterOwed) { block.q = true; this.quarterOwed = false; }
    }
    fillBlock(minute, sweep = false) {
      const { faces } = this.findFaces(this.box);
      this.facesNow = { faces, sub: this.sub };                // (fillSeams, later this same minute, looks at these too)
      const progress = minute / this.st.minutes, cands = [];
      // Late in the hour, less fussy. The walker core's blocks are irregular from the start.
      const relax = sweep || progress > CFG.RELAX_AFTER || this.walkerOnly();
      for (const f of faces) {
        if (this.squareFace(f)) { f.square = true; continue; }       // the hour's square stays open
        // In the last-minute sweep, big leftover areas count too: estates, yards, parks.
        if (f.area < this.minBlock || f.area > (sweep ? 2.5 : 1) * this.maxBlock) continue;
        // Its middle must be in this section — or, for an area closed off by this section's
        // streets along the border, in a section that's already finished.
        if (!this.inSection(f.c)) {
          let ownsEdge = false;
          for (const id of f.edgeIds) { const e = this.edges.get(id); if (e.sid === this.sid && !e.arterial) { ownsEdge = true; break; } }
          if (!ownsEdge || !this.inFinishedSection(f.c)) continue;
        }
        f.key = [...f.edgeIds].sort((a, b) => a - b).join(',');
        if (this.filledKeys.has(f.key)) continue;                  // this exact face is already a block
        const hosts = this.blocks.filter(bl => pointInPoly(f.c, bl.ring));
        if (hosts.some(bl => f.area / bl.area > 0.85)) continue;  // already filled
        if (hosts.some(bl => bl.sid !== this.sid)) continue;      // part of an earlier hour's block: leave it
        const host = hosts.length > 0;
        const turns = cornerTurns(f.pts, this.cornerTol);
        if (relax) {
          // Late in the hour, any tidy-enough shape; when behind, any shape that's still compact.
          if (turns.length < 3 || (!sweep && turns.length > 6)) continue;
          if (sweep && compactness([f.pts]) < CFG.MIN_COMPACT_ANY) continue;
        } else {
          if (turns.length !== 4) continue;
          if (turns.some(t => Math.abs(t - 90) > this.rectTol)) continue;   // roughly rectangular
        }
        if (sweep && host) continue;                                        // no re-splitting in the sweep
        let perim = 0; for (let i = 0; i < f.pts.length; i++) perim += dist(f.pts[i], f.pts[(i + 1) % f.pts.length]);
        const compact = (4 * Math.PI * f.area) / (perim * perim);
        let cemented = 0; for (const id of f.edgeIds) if (this.edges.get(id).state === 'CEMENTED') cemented++;
        const score = -Math.abs(f.area - this.blockArea) / this.blockArea + compact
          + 0.5 * cemented / f.edgeIds.size
          + 0.5 * (1 - dist(f.c, this.origin) / this.extent) * (1 - progress)
          - (host ? 1.0 : 0)
          - 1.2 * (1 - this.inwardness(f.c))                         // the city's edge is filled last
          - (turns.length !== 4 ? 0.8 : 0);                                // still prefer four sides
        cands.push({ f, score });
      }
      if (!cands.length) return false;
      const mx = Math.max(...cands.map(c => c.score));
      let total = 0; for (const c of cands) { c.w = Math.exp((c.score - mx) / CFG.SOFTMAX_T); total += c.w; }
      let r = this.rng() * total, pick = cands[0];
      for (const c of cands) { r -= c.w; if (r <= 0) { pick = c; break; } }
      const f = pick.f;
      const block = { pts: f.pts.map(p => ({ x: p.x, y: p.y })), ring: f.pts.map(p => [p.x, p.y]),
                      area: f.area, c: f.c, born: this.time, sid: this.sid, extra: [] };
      this.blocks.push(block); this.filled++; this.filledKeys.add(f.key); this.countBlock(block);
      const cutHour = this.cutSid === this.sid; if (cutHour) this.cutLeft--;
      // The hour's last block also takes in every enclosed area still empty in the section, as long as
      // each is compact on its own (they're drawn separately, so only odd shapes would show).
      if (this.filled === this.quota) {
        for (const g of faces) {
          if (g === f || g.square || !this.inSection(g.c) || g.area < 0.25 * this.minBlock) continue;
          g.key = g.key || [...g.edgeIds].sort((a, b) => a - b).join(',');
          if (this.filledKeys.has(g.key) || this.inFilledBlock(g.c)) continue;
          if (compactness([g.pts]) < 0.75) continue;
          block.extra.push(g.pts.map(p => ({ x: p.x, y: p.y }))); block.area += g.area; this.filledKeys.add(g.key);
        }
      }
      // Take in neighbouring empty areas until the block holds its share of the section.
      const byEdge = new Map();
      for (const g of faces) for (const id of g.edgeIds) { if (!byEdge.has(id)) byEdge.set(id, []); byEdge.get(id).push(g); }
      // …but only if there are enough empty areas left for the rest of the hour's blocks.
      const emptyLeft = cands.length - 1, blocksLeft = this.quota - this.filled;
      // (An hour of cut streets knows how many cells it planned: the spare ones are shared out among
      // its blocks through the hour, so the section fills evenly instead of all at the last minute.)
      // spare = areas enclosed and empty now + cells still to be built − blocks still to come
      let queued = 0; if (cutHour) for (const id of this.planQueue) if (this.plans[id].kind === 'cut') queued++;
      const spare = cutHour ? emptyLeft + (this.cutKept || 0) * queued / Math.max(1, this.cutCount || 1) - blocksLeft : 0;
      const canMerge = cutHour ? spare > 0 && this.rng() * Math.max(1, blocksLeft) < spare : emptyLeft >= 1.5 * blocksLeft;
      const queue = canMerge ? [f] : [], seen = new Set([f]);
      while (queue.length && block.area < 0.9 * this.blockTarget) {
        const cur = queue.shift();
        for (const id of cur.edgeIds) for (const g of byEdge.get(id) || []) {
          if (seen.has(g)) continue; seen.add(g);
          g.key = g.key || [...g.edgeIds].sort((a, b) => a - b).join(',');
          if (g.square || this.filledKeys.has(g.key) || g.area > this.blockTarget || !this.inSection(g.c)) continue;
          if (this.blocks.some(bl => pointInPoly(g.c, bl.ring))) continue;
          if (block.area + g.area > 1.3 * this.blockTarget) continue;
          const ring = g.pts.map(p => ({ x: p.x, y: p.y }));
          if (compactness([block.pts, ...block.extra, ring]) < CFG.MIN_COMPACT) continue;   // keep it block-shaped
          block.extra.push(ring); block.area += g.area;
          this.filledKeys.add(g.key); queue.push(g);
          if (cutHour) this.cutLeft--;
          for (const eid of g.edgeIds) { const e = this.edges.get(eid); if (e && !e.frozen) e.state = 'CEMENTED'; }
          if (block.area >= 0.9 * this.blockTarget) break;
        }
      }
      for (const id of f.edgeIds) {
        const e = this.edges.get(id);
        if (!e.frozen) { e.state = 'CEMENTED'; if (this.thicken) e.width = Math.min(CFG.WIDTH_MAX, e.width + CFG.WIDTH_BLOCK); }
      }
      this.events.push({ type: 'block', block, t: this.time });
      this.prune(f.c);
      return true;
    }
    splitOffBlock() {
      let host = null;
      for (const b of this.blocks) if (b.sid === this.sid && b.extra && b.extra.length && (!host || b.extra.length > host.extra.length)) host = b;
      if (!host) {
        // no extra areas to give up: an enclosed area inside one of this hour's blocks (split off by
        // a later street) becomes the minute's block. It's already shaded, so it's drawn only as a pulse.
        const { faces } = this.findFaces(this.box);
        for (const f of faces) {
          if (!this.inSection(f.c) || f.area < 0.25 * this.minBlock || this.squareFace(f)) continue;
          f.key = [...f.edgeIds].sort((a, b) => a - b).join(',');
          if (this.filledKeys.has(f.key) || !this.inFilledBlock(f.c)) continue;
          const block = { pts: f.pts.map(p => ({ x: p.x, y: p.y })), ring: f.pts.map(p => [p.x, p.y]), area: f.area, c: f.c,
                          born: this.time, sid: this.sid, extra: [], sub: true };
          this.blocks.push(block); this.filled++; this.filledKeys.add(f.key); this.countBlock(block);
          this.events.push({ type: 'block', block, t: this.time });
          return true;
        }
        return false;
      }
      const pts = host.extra.pop();
      const ring = pts.map(p => [p.x, p.y]), area = Math.abs(signedArea(pts));
      host.area -= area;
      const block = { pts, ring, area, c: centroid(pts), born: this.time, sid: this.sid, extra: [] };
      this.blocks.push(block); this.filled++; this.countBlock(block);
      this.events.push({ type: 'block', block, t: this.time });
      return true;
    }
    // Follow a street through junctions where it carries on nearly straight: a "road".
    roadThrough(e0) {
      // Walk out from e0 in both directions; returns the streets in order along the road.
      const used = new Set([e0.id]), sides = [];
      for (const startId of [e0.a, e0.b]) {
        const side = []; let n = this.nodes.get(startId), e = e0;
        for (let k = 0; k < 40 && n; k++) {
          const into = this.dirAt(n, e) + Math.PI;
          let next = null, bestTurn = 20 * DEG;
          for (const id of n.edges) {
            if (id === e.id || used.has(id)) continue;
            const x = this.edges.get(id);
            if (!x || !this.isActive(x) || x.frozen || x.sid !== this.sid) continue;
            const turn = Math.abs(wrapPi(this.dirAt(n, x) - into));
            if (turn < bestTurn) { bestTurn = turn; next = x; }
          }
          if (!next) break;
          side.push(next); used.add(next.id); e = next;
          n = this.nodes.get(next.a === n.id ? next.b : next.a);
        }
        sides.push(side);
      }
      return sides[0].reverse().concat([e0], sides[1]);
    }
    // The road's path as points, in order.
    roadPath(road) {
      if (road.length === 1) return road[0].pts.slice();
      const out = [];
      for (let i = 0; i < road.length; i++) {
        const e = road[i], next = road[i + 1], prev = road[i - 1];
        let pts = e.pts;
        const shares = (x, id) => x && (x.a === id || x.b === id);
        if (next ? shares(next, e.a) : !shares(prev, e.a)) pts = pts.slice().reverse();   // end at the shared node
        for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > 0.01) out.push(p);
      }
      return out;
    }
    // A minute with no block to fill: the straightest long road in the section gets wider.
    widenMainRoad() {
      let edges = this.sectionEdges(); if (!edges.length) return;
      const arts = edges.filter(e => e.arterial);
      if (arts.length) edges = arts;                       // the section's main roads, if it has them
      const spacing = CFG.ART_SPACING_M / CFG.M_PER_PX;
      let best = null;
      for (let k = 0; k < 40; k++) {
        const road = this.roadThrough(edges[Math.floor(this.rng() * edges.length)]);
        if (road.every(e => e.width >= CFG.WIDTH_MAX)) continue;
        const L = road.reduce((s, e) => s + e.len, 0);
        const path = this.roadPath(road), a = path[0], b = path[path.length - 1];
        const already = road.some(e => e.arterial);
        if (!already && !this.meetsMainRoads(path[0], path[path.length - 1])) continue;   // must join the network
        // a new main road must not run alongside an existing one
        if (!already && this.parallelArterialNear({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angleOf(a, b), spacing, new Set(road.map(e => e.id)))) continue;
        // favour roads that carry on an existing main road, and main roads already chosen
        const score = L * (1 + (this.continuesArterial(road) ? 1.5 : 0) + (already ? 1 : 0));
        if (!best || score > best.score) best = { road, score };
      }
      if (!best) return;
      const path = this.roadPath(best.road);
      for (const e of best.road) { e.width = Math.min(CFG.WIDTH_MAX, e.width + CFG.WIDTH_ROAD); e.arterial = true; }
      this.events.push({ type: 'road', ids: best.road.map(e => e.id), path, width: Math.max(...best.road.map(e => e.width)), t: this.time });
    }

    // A main road (arterial) near p, running within 15° of parallel to ang, other than these.
    parallelArterialNear(p, ang, r, ignore = new Set()) {
      for (const id of this.hash.query(p.x - r, p.y - r, p.x + r, p.y + r)) {
        if (ignore.has(id)) continue;
        const e = this.edges.get(id); if (!e || !e.arterial || !this.isActive(e)) continue;
        const a = e.pts[0], b = e.pts[e.pts.length - 1];
        if (Math.abs(Math.sin(angleOf(a, b) - ang)) > Math.sin(15 * DEG)) continue;
        if (distToSeg(p, a, b) < r) return true;
      }
      return false;
    }
    // Does this road carry on a main road at either end, nearly straight through the junction?
    continuesArterial(road) {
      const path = this.roadPath(road), ids = new Set(road.map(e => e.id));
      for (const [end, prev] of [[path[0], path[1]], [path[path.length - 1], path[path.length - 2]]]) {
        if (!prev) continue;
        const n = this.nodesNear(end, 0.5)[0]; if (!n) continue;
        const out = angleOf(prev, end);
        for (const id of n.edges) {
          if (ids.has(id)) continue;
          const e = this.edges.get(id); if (!e || !e.arterial) continue;
          if (Math.abs(wrapPi(this.dirAt(n, e) - out)) < CFG.ART_TURN * DEG) return true;
        }
      }
      return false;
    }
    // At a section's start: carry each main road that reaches its edge straight across it, as one
    // thoroughfare — unless another main road already runs parallel close by.
    thoroughfares() {
      const spacing = CFG.ART_SPACING_M / CFG.M_PER_PX, planned = [];
      const ends = [...this.nodes.values()].filter(n => n.edges.size === 1 && n.gate && this.entersSection(n))
        .map(n => ({ n, e: this.edges.get([...n.edges][0]) }))
        .filter(x => x.e && this.onNetwork(x.e))            // only roads already on the network
        .sort((p, q) => q.e.width - p.e.width);
      for (const { n, e } of ends) {
        let h = this.dirAt(n, e) + Math.PI;
        // main roads follow the grid where there is one (old roads keep their line where there isn't)
        if (e.arterial || (this.gridStrength || 0) >= 0.5) h = this.snapToGrid(h);
        let L = this.distToEdge({ x: n.x + Math.cos(h) * 2, y: n.y + Math.sin(h) * 2 }, h);
        if (!Number.isFinite(L)) continue;
        for (let d = 2; d < L; d += 2) {                    // stop short of the river
          if (this.nearRiver({ x: n.x + Math.cos(h) * d, y: n.y + Math.sin(h) * d }, this.riverBuffer)) { L = d - 2; break; }
        }
        if (L < CFG.ART_MIN_LEN) continue;
        const end = { x: n.x + Math.cos(h) * (L + 1), y: n.y + Math.sin(h) * (L + 1) };
        const mid = { x: (n.x + end.x) / 2, y: (n.y + end.y) / 2 };
        if (this.parallelArterialNear(mid, h, spacing, new Set([e.id]))) continue;
        if (planned.concat(this.sectionMainLines || []).some(([a, b]) => Math.abs(Math.sin(angleOf(a, b) - h)) < Math.sin(15 * DEG) && distToSeg(mid, a, b) < spacing)) continue;
        if (this.mainRoadsLeft() <= 0) break;
        planned.push([{ x: n.x, y: n.y }, end]);
        (this.sectionMainLines = this.sectionMainLines || []).push([{ x: n.x, y: n.y }, end]);
        this.mainRoadCount = (this.mainRoadCount || 0) + 1;
        const plan = this.addPlan([{ x: n.x, y: n.y }, end], 'thoroughfare');
        plan.width = Math.max(e.width, CFG.WIDTH0 + CFG.WIDTH_ROAD);
      }
    }
    // Does the line a→b meet the main-road network (a main road, an old road, or the bridge)?
    meetsMainRoads(a, b, extra = []) {
      const x0 = Math.min(a.x, b.x) - 3, y0 = Math.min(a.y, b.y) - 3, x1 = Math.max(a.x, b.x) + 3, y1 = Math.max(a.y, b.y) + 3;
      for (const id of this.hash.query(x0, y0, x1, y1)) {
        const e = this.edges.get(id);
        if (!e || !this.isActive(e) || !this.onNetwork(e)) continue;
        for (let i = 1; i < e.pts.length; i++) {
          if (segHit(a, b, e.pts[i - 1], e.pts[i])) return true;
          if (distToSeg(e.pts[i - 1], a, b) < 3 || distToSeg(e.pts[i], a, b) < 3) return true;   // ends on it
        }
      }
      for (const [u, v] of extra) if (segHit(a, b, u, v) || distToSeg(u, a, b) < 3 || distToSeg(v, a, b) < 3) return true;
      return false;
    }
    mainRoadsLeft() {
      if (this.mainRoadsHourStage !== this.stage) { this.mainRoadsHourStage = this.stage; this.mainRoadsAtHourStart = this.mainRoadCount || 0; }
      const thisHour = (this.mainRoadCount || 0) - this.mainRoadsAtHourStart;
      return Math.min(CFG.MAX_MAIN_ROADS - (this.mainRoadCount || 0), CFG.MAIN_ROADS_PER_HOUR - thisHour);
    }
    // Make sure every group of main roads is joined to the bridge's network: link each separate
    // group to it by a straight road from their nearest points (not across water or high ground).
    joinMainRoads() {
      const net = [...this.edges.values()].filter(e => this.isActive(e) && this.onNetwork(e));
      if (!net.length) return;
      const adj = new Map();
      for (const e of net) for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); }
      const comp = new Map(); let k = 0; const groups = [];
      for (const n of adj.keys()) {
        if (comp.has(n)) continue;
        const g = [n]; comp.set(n, k);
        for (let i = 0; i < g.length; i++) for (const y of adj.get(g[i])) if (!comp.has(y)) { comp.set(y, k); g.push(y); }
        groups.push(g); k++;
      }
      if (groups.length < 2) return;
      const bridgeEdge = net.find(e => e.bridge);
      const mainK = bridgeEdge ? comp.get(bridgeEdge.a) : groups.indexOf(groups.reduce((a, b) => (b.length > a.length ? b : a)));
      const main = groups[mainK].map(id => this.nodes.get(id)).filter(Boolean);
      groups.forEach((g, gi) => {
        if (gi === mainK) return;
        if (g.length < 3) {                                  // a stray piece (its road faded around it): an ordinary street again
          const set = new Set(g);
          for (const e of net) if (set.has(e.a) && set.has(e.b) && !e.bridge) { delete e.arterial; delete e.netSeed; }
          this.frozenVersion++;
          return;
        }
        let best = null;
        for (const id of g) {
          const n = this.nodes.get(id); if (!n) continue;
          for (const m of main) { const d = dist(n, m); if (!best || d < best.d) best = { n, m, d }; }
        }
        if (!best || best.d > 400) return;
        if (best.d < 6) {                                    // all but touching: one short link, at once
          let e = [...best.n.edges].map(id => this.edges.get(id)).find(x => x && (x.a === best.m.id || x.b === best.m.id));
          if (!e && best.n !== best.m) e = this.addEdge(best.n, best.m, [{ x: best.n.x, y: best.n.y }, { x: best.m.x, y: best.m.y }], 'CEMENTED', CFG.WIDTH0 + CFG.WIDTH_ROAD);
          if (e) { e.main = e.road = e.arterial = true; e.kind = e.kind || 'thoroughfare'; }
          return;
        }
        for (let f = 0.1; f < 1; f += 0.1) {                 // not across water or high ground
          const p = { x: best.n.x + (best.m.x - best.n.x) * f, y: best.n.y + (best.m.y - best.n.y) * f };
          if (this.inRiver(p) || this.zoneAt(p) === 3) return;
        }
        let pts = [{ x: best.n.x, y: best.n.y }, { x: best.m.x, y: best.m.y }];
        if ((this.gridStrength || 0) >= 0.5 && this.gridAngle !== undefined) {   // an L along the grid
          const u = { x: Math.cos(this.gridAngle), y: Math.sin(this.gridAngle) };
          const dx = best.m.x - best.n.x, dy = best.m.y - best.n.y, along = dx * u.x + dy * u.y;
          const corner = { x: best.n.x + u.x * along, y: best.n.y + u.y * along };
          if (!this.inRiver(corner) && this.zoneAt(corner) !== 3) pts = [pts[0], corner, pts[1]];
        }
        const plan = this.addPlan(pts, 'thoroughfare');
        plan.width = CFG.WIDTH0 + CFG.WIDTH_ROAD;
      });
    }
    // The main-road network: the old city's main streets (the walkers' trails and the walls they
    // meet, as far as they hang together from the market), the bridge and its approach, the far
    // bank's first paths, and every main road since. Every new main road must connect to it.
    onNetwork(e) { return !!(e.arterial || e.bridge || e.netSeed); }
    seedNetwork() {
      this.netSeeded = true;
      const old = e => e && this.isActive(e) && (e.road || e.kind === 'wall' || e.kind === 'trail');
      const seen = new Set(), stack = [];
      for (const id of this.hash.query(this.center.x - 14, this.center.y - 14, this.center.x + 14, this.center.y + 14)) { const e = this.edges.get(id); if (old(e)) { stack.push(e.a, e.b); } }
      while (stack.length) {
        const n = this.nodes.get(stack.pop()); if (!n || seen.has(n.id)) continue; seen.add(n.id);
        for (const id of n.edges) { const e = this.edges.get(id); if (!old(e)) continue; e.netSeed = true; stack.push(e.a === n.id ? e.b : e.a); }
      }
      this.frozenVersion++;
    }
    // Existing streets become main road: the easiest way along the streets from node `from` to the
    // main-road network (short, and turning as little as it can). Returns the streets, or null.
    promoteToNetwork(from, maxCost = 900) {
      const best = new Map([[from.id, { cost: 0, via: null, dir: null }]]), open = [from.id], closed = new Set();
      let goal = null;
      while (open.length) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (best.get(open[i]).cost < best.get(open[bi]).cost) bi = i;
        const id = open.splice(bi, 1)[0]; if (closed.has(id)) continue; closed.add(id);
        const n = this.nodes.get(id), b = best.get(id);
        if (b.cost > maxCost) break;
        if ([...n.edges].some(eid => { const e = this.edges.get(eid); return e && this.isActive(e) && this.onNetwork(e); })) { goal = id; break; }
        for (const eid of n.edges) {
          const e = this.edges.get(eid); if (!e || !this.isActive(e)) continue;
          const o = e.a === id ? e.b : e.a, on = this.nodes.get(o); if (!on || closed.has(o)) continue;
          const dir = angleOf(n, on), turn = b.dir === null ? 0 : Math.abs(wrapPi(dir - b.dir));
          const c = b.cost + e.len + (turn > 20 * DEG ? 10 : 0) + (turn > 60 * DEG ? 20 : 0);
          if (!best.has(o) || c < best.get(o).cost) { best.set(o, { cost: c, via: eid, from: id, dir }); open.push(o); }
        }
      }
      if (goal === null) return null;
      const out = []; for (let id = goal; best.get(id).via !== null; id = best.get(id).from) out.push(this.edges.get(best.get(id).via));
      return out;
    }
    markMainRoad(edges) {
      if (!edges.length) return;
      for (const e of edges) { e.arterial = e.road = e.main = true; e.width = Math.max(e.width, CFG.WIDTH0 + CFG.WIDTH_ROAD); }
      this.events.push({ type: 'road', ids: edges.map(e => e.id), path: this.roadPath(edges.slice().reverse()), width: Math.max(...edges.map(e => e.width)), t: this.time });
      this.frozenVersion++;
    }
    // Extend the line a→b back along itself (from a), then forward (from b), until it meets the
    // main-road network; stop at water or high ground. Returns the extended line, or null.
    extendToNetwork(a, b, extra = []) {
      const L = dist(a, b) || 1, u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, reach = 2 * this.box.r;
      for (const [from, sgn] of [[a, -1], [b, 1]]) {
        let prev = from;
        for (let d = 2; d <= reach; d += 2) {
          const p = { x: from.x + sgn * u.x * d, y: from.y + sgn * u.y * d };
          if (this.nearRiver(p, this.riverBuffer) || this.zoneAt(p) === 3) break;
          if (this.meetsMainRoads(prev, p, extra)) return sgn < 0 ? [p, b] : [a, p];
          prev = p;
        }
      }
      return null;
    }
    // A section the main-road network doesn't reach yet gets one connector: straight from the
    // network's nearest point, across the section (along its grid, if it has one).
    connectMainRoads() {
      if (this.mainRoadsLeft() <= 0) return;
      if ((this.sectionMainLines || []).length) return;        // a carried main road already crosses it
      const B = this.box;
      // already reached? a main road or old road inside or ending at the section
      for (const id of this.hash.query(B.x - B.r, B.y - B.r, B.x + B.r, B.y + B.r)) {
        const e = this.edges.get(id);
        if (e && this.isActive(e) && e.arterial && (this.inSection(e.pts[0]) || this.inSection(e.pts[e.pts.length - 1]))) return;
      }
      let best = null;
      for (const e of this.edges.values()) {
        if (!this.isActive(e) || !this.onNetwork(e)) continue;
        for (const nid of [e.a, e.b]) { const n = this.nodes.get(nid); const d = n && dist(n, B); if (n && (!best || d < best.d)) best = { n, d }; }
      }
      if (!best) return;
      const n = best.n;
      let h = angleOf(n, B);
      if (this.gridStrength > 0.3) h = this.align(h);
      // walk out until inside the section, then on until it leaves (or meets water or high ground)
      let inAt = -1, outAt = -1;
      for (let d = 2; d < 2.5 * B.r + best.d; d += 2) {
        const p = { x: n.x + Math.cos(h) * d, y: n.y + Math.sin(h) * d };
        if (this.nearRiver(p, this.riverBuffer) || this.zoneAt(p) === 3) { outAt = d - 2; break; }
        const inside = this.inSection(p);
        if (inAt < 0 && inside) inAt = d;
        if (inAt >= 0 && !inside) { outAt = d; break; }
      }
      if (inAt < 0 || outAt - inAt < CFG.ART_MIN_LEN) return;
      const end = { x: n.x + Math.cos(h) * outAt, y: n.y + Math.sin(h) * outAt };
      const plan = this.addPlan([{ x: n.x, y: n.y }, end], 'thoroughfare'); plan.width = CFG.WIDTH0 + CFG.WIDTH_ROAD;
      this.mainRoadCount = (this.mainRoadCount || 0) + 1;
      this.sectionMainLines.push([{ x: n.x, y: n.y }, end]);
    }
    // ── Cut streets (version 2, after 08:00): the section is divided into blocks by streets parallel
    //    to its grain (long streets) and between them (cross streets), on a lattice anchored at the
    //    market. Order (0–1) sets how regular they are. ──
    hasMainRoadsNear() {
      if ((this.sectionMainLines || []).length) return true;
      const B = this.box;
      for (const id of this.hash.query(B.x - B.r, B.y - B.r, B.x + B.r, B.y + B.r)) {
        const e = this.edges.get(id); if (e && e.arterial && this.isActive(e) && this.nearSection(e.pts[0], 20)) return true;
      }
      return false;
    }
    orderAt(p) {
      const k = this.stage, ot = (k - CFG.ORDER_FROM_HOUR) / (CFG.ORDER_TO_HOUR - CFG.ORDER_FROM_HOUR);
      const dm = dist(p, this.center) * CFG.M_PER_PX, od = (dm - CFG.ORDER_DIST_M[0]) / (CFG.ORDER_DIST_M[1] - CFG.ORDER_DIST_M[0]);
      return Math.min(1, Math.max(0, ot, od));
    }
    // Where a line crosses the section: inside intervals along it, split at water and high ground.
    sectionRuns(o, u, nrm, along0, along1) {
      const across = p => p.x * nrm.x + p.y * nrm.y, along = p => p.x * u.x + p.y * u.y;
      const ts = [];
      for (const poly of this.section.poly) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = { x: poly[j][0], y: poly[j][1] }, b = { x: poly[i][0], y: poly[i][1] };
        const da = across(a) - o, db = across(b) - o;
        if ((da > 0) === (db > 0)) continue;
        const f = da / (da - db); ts.push(along(a) + (along(b) - along(a)) * f);
      }
      ts.sort((p, q) => p - q);
      const at = t => ({ x: nrm.x * o + u.x * t, y: nrm.y * o + u.y * t }), runs = [];
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const lo = Math.max(ts[i], along0 === undefined ? -Infinity : along0), hi = Math.min(ts[i + 1], along1 === undefined ? Infinity : along1);
        let start = null;
        for (let t = lo + 0.5; t <= hi - 0.5; t += 2) {
          const p = at(t), ok = !this.nearRiver(p, this.riverBuffer) && this.zoneAt(p) !== 3;
          if (ok && start === null) start = t;
          if (!ok && start !== null) { runs.push([at(start), at(t - 2)]); start = null; }
        }
        if (start !== null) runs.push([at(start), at(hi - 0.5)]);
      }
      return runs;
    }
    // Main roads the hour's blocks should front onto: the ones already built around the section,
    // and the ones planned this hour (still waiting to be drawn).
    mainLinesNear() {
      const B = this.box, out = [];
      for (const id of this.hash.query(B.x - B.r, B.y - B.r, B.x + B.r, B.y + B.r)) {
        const e = this.edges.get(id);
        if (e && this.isActive(e) && (e.arterial || e.road)) out.push([e.pts[0], e.pts[e.pts.length - 1]]);
      }
      const planned = [];
      for (const id of this.planQueue) {
        const p = this.plans[id]; if (p.kind !== 'thoroughfare') continue;
        for (let i = p.i; i + 1 < p.pts.length; i++) planned.push([p.pts[i], p.pts[i + 1]]);
      }
      return { built: out, planned, all: out.concat(planned) };
    }
    // The parts of a→b that aren't already a street (or a main road planned this hour): a cut street
    // is never drawn on top of another.
    uncoveredRuns(a, b, planned) {
      const len = dist(a, b); if (len < 0.5) return [];
      const dir = angleOf(a, b), n = Math.max(1, Math.ceil(len / 2)), runs = [];
      const covered = p => {
        for (const id of this.hash.query(p.x - 1.5, p.y - 1.5, p.x + 1.5, p.y + 1.5)) {
          const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
          const p0 = e.pts[0], p1 = e.pts[e.pts.length - 1];
          if (Math.abs(Math.sin(angleOf(p0, p1) - dir)) < 0.2 && distToSeg(p, p0, p1) < 1.5) return true;
        }
        for (const [p0, p1] of planned) if (Math.abs(Math.sin(angleOf(p0, p1) - dir)) < 0.2 && distToSeg(p, p0, p1) < 1.5) return true;
        return false;
      };
      let start = null;
      for (let i = 0; i <= n; i++) {
        const f = i / n, p = i === 0 ? a : i === n ? b : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, c = covered(p);
        if (!c && start === null) start = p;
        if (c && start !== null) { runs.push([start, p]); start = null; }
      }
      if (start !== null) runs.push([start, b]);
      return runs.filter(([p, q]) => dist(p, q) >= 3);
    }
    // Straight runs: pieces of main road that lie on one line and touch are joined end to end.
    straightRuns(segs) {
      const items = segs.map(([p, q]) => ({ p, q })), runs = [];
      const used = new Array(items.length).fill(false);
      for (let i = 0; i < items.length; i++) {
        if (used[i] || dist(items[i].p, items[i].q) < 2) continue; used[i] = true;
        let a = items[i].p, b = items[i].q, grown = true;
        while (grown) {
          grown = false;
          const dir = angleOf(a, b), ux = Math.cos(dir), uy = Math.sin(dir), len = dist(a, b);
          for (let j = 0; j < items.length; j++) {
            if (used[j]) continue;
            const s = items[j];
            if (Math.abs(Math.sin(angleOf(s.p, s.q) - dir)) > 0.06) continue;
            const off = v => Math.abs(-(v.x - a.x) * uy + (v.y - a.y) * ux), t = v => (v.x - a.x) * ux + (v.y - a.y) * uy;
            if (off(s.p) > 2.5 || off(s.q) > 2.5) continue;
            const t1 = Math.min(t(s.p), t(s.q)), t2 = Math.max(t(s.p), t(s.q));
            if (t1 > len + 6 || t2 < -6) continue;                    // not touching
            used[j] = true; grown = true;
            const lo = Math.min(0, t1), hi = Math.max(len, t2);
            const na = { x: a.x + ux * lo, y: a.y + uy * lo }, nb = { x: a.x + ux * hi, y: a.y + uy * hi };
            a = na; b = nb; break;
          }
        }
        runs.push([a, b]);
      }
      return runs;
    }
    // The hour's streets, planned block by block. The land is laid out as lattices of block cells:
    // strips between "long" streets, divided by "cross" streets. Most of the section shares one
    // lattice along its grain, anchored at the market; but a main road running at its own angle
    // (a walkers' trail, an old road) sets the grain of the blocks beside it, a few strips deep, so
    // blocks front the road. Order (0–1) sets how regular it all is. Then:
    //  1. every cell whose middle is in the section and which sits on free, dry, buildable land is a
    //     candidate (a cell is built whole, so the streets may cross the section's outline a little);
    //  2. cells are taken one by one, spreading from the existing city and the main roads — all of them
    //     in the city, fewer in the suburbs (the ones nearest the main roads), so the edge thins out;
    //  3. each taken cell gets all its sides, in that order, so blocks close one after another;
    //  4. where the new streets end facing older streets (or another lattice) they carry on to the
    //     first street they meet.
    planCuts() {
      if (this.gridAngle === undefined) this.gridAngle = this.grainAround(this.section) ?? 0;
      const rng = this.rng;
      const outline = this.section.poly.flat().map(([x, y]) => ({ x, y }));
      const o0 = this.orderAt(this.box);
      const aspect = lerp(CFG.CUT_ASPECT[0], CFG.CUT_ASPECT[1], o0);
      const mains = this.mainLinesNear();
      // Enclosed areas already there (blocks, yards): new cells keep off them.
      const side0 = Math.sqrt(this.blockArea), reach0 = this.box.r + 3 * side0;
      const taken = this.findFaces({ x: this.box.x, y: this.box.y, r: reach0 }).faces.filter(f => f.area <= 2.5 * this.blockTarget).map(f => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of f.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        return { ring: f.pts.map(p => [p.x, p.y]), x0, y0, x1, y1 };
      });
      const inTaken = p => { for (const f of taken) if (p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1 && pointInPoly(p, f.ring)) return true; return false; };
      const dry = p => p.x > 4 && p.y > 4 && p.x < this.mapW - 4 && p.y < this.mapH - 4 && this.zoneAt(p) !== 3 && !this.nearRiver(p, this.riverBuffer);
      const dMain = p => { let d = Infinity; for (const [a, b] of mains.all) d = Math.min(d, distToSeg(p, a, b)); return d; };

      // The lattices ("frames"): one for each main road that runs well off the grain, then the section's own.
      const frames = [];
      const L0 = side0 * Math.sqrt(aspect), q90 = Math.PI / 2;
      const offGrain = (p, q) => { const d = ((angleOf(p, q) - this.gridAngle) % q90 + q90) % q90; return Math.min(d, q90 - d) / DEG; };
      const guides = this.straightRuns(mains.all).filter(([p, q]) => {
        if (dist(p, q) < 1.2 * L0 || offGrain(p, q) < CFG.CUT_DISTRICT_MIN_DEG) return false;
        for (const f of [0.25, 0.5, 0.75]) { const m = { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f }; if (this.inSection(m) || this.nearSection(m, 0.6 * L0)) return true; }
        return false;
      }).sort((a, b) => dist(b[0], b[1]) - dist(a[0], a[1])).slice(0, CFG.CUT_DISTRICTS);
      const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const jitterAt = o => Math.max(0, 1 - o / CFG.BLOCK_JITTER_UNTIL) ** 2;   // block-by-block wobble: only in the least ordered hours
      const brickAt = o => clampTo((0.6 - o) / 0.2, 0, 1);
      for (const [p, q] of guides) {
        const o = this.orderAt({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        frames.push({ th: angleOf(p, q), anchor: p, guide: [p, q], o, scaleMul: 1, aspect, brick: rng() < brickAt(o) });
      }
      // Patches: the rest of the section is laid out in regular pieces of several blocks, like
      // subdivisions. Disorder lives between patches, not inside them: each has its own direction (the
      // grain of the streets around it, less and less as order rises, plus a random turn), its own
      // block size and proportions, and its own pattern (bricks or crossroads). Patches grow with
      // order, until one covers the whole section.
      const samples = [], gx0 = Math.min(...outline.map(p => p.x)) + 4, gy0 = Math.min(...outline.map(p => p.y)) + 4;
      {
        const x1 = Math.max(...outline.map(p => p.x)), y1 = Math.max(...outline.map(p => p.y));
        for (let y = gy0; y < y1; y += 8) for (let x = gx0; x < x1; x += 8) { const p = { x, y }; if (this.inSection(p) && dry(p)) samples.push(p); }
      }
      const perPatch = lerp(CFG.PATCH_BLOCKS[0], CFG.PATCH_BLOCKS[1], Math.pow(o0, 1.3));
      const nPatch = clampTo(Math.round(samples.length * 64 / this.blockArea / perPatch), 1, 14);
      // The patches are wedges of equal land, taken in turn round the place the section grows from
      // (starting at the widest gap in its land, so no patch straddles the gap).
      const turnOf = p => Math.atan2(p.y - this.origin.y, p.x - this.origin.x);
      const round = samples.map(p => ({ p, a: turnOf(p) })).sort((u, v) => u.a - v.a);
      let cutAt = 0, widest = -1;
      for (let i = 0; i < round.length; i++) { const gap = i ? round[i].a - round[i - 1].a : round[0].a + 2 * Math.PI - round[round.length - 1].a; if (gap > widest) { widest = gap; cutAt = i; } }
      const inTurn = round.slice(cutAt).concat(round.slice(0, cutAt));
      const seeds = [], groups = [], patchAt = new Map(), gridKey = p => Math.round((p.x - gx0) / 8) + ',' + Math.round((p.y - gy0) / 8);
      for (let k = 0; k < nPatch && inTurn.length; k++) {
        const part = inTurn.slice(Math.floor(k * inTurn.length / nPatch), Math.floor((k + 1) * inTurn.length / nPatch)).map(u => u.p);
        if (!part.length) continue;
        for (const p of part) patchAt.set(gridKey(p), seeds.length);
        seeds.push(centroid(part)); groups.push(part);
      }
      if (!seeds.length) { seeds.push({ x: this.box.x, y: this.box.y }); groups.push([seeds[0]]); }
      const seedOf = p => {                                           // which patch a point's land belongs to
        const gi = Math.round((p.x - gx0) / 8), gj = Math.round((p.y - gy0) / 8);
        for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const k = patchAt.get((gi + di) + ',' + (gj + dj)); if (k !== undefined) return k; }
        let bi = 0, bd = Infinity; for (let i = 0; i < seeds.length; i++) { const d = (p.x - seeds[i].x) ** 2 + (p.y - seeds[i].y) ** 2; if (d < bd) { bd = d; bi = i; } } return bi;
      };
      const wrap90 = a => ((a + Math.PI / 4) % q90 + q90) % q90 - Math.PI / 4;
      const order = seeds.map((p, i) => i).sort((a, b) => dist(seeds[a], this.origin) - dist(seeds[b], this.origin));
      // The patches' turns off the grain are spread evenly over ± a range that narrows with order (so
      // the hour's mix of directions falls steadily through the day), and dealt out at random.
      const K = seeds.length, spread = seeds.map((p, i) => K > 1 ? -1 + 2 * i / (K - 1) : 0);
      for (let i = K - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [spread[i], spread[j]] = [spread[j], spread[i]]; }
      for (const i of order) {
        const seed = seeds[i], o = this.orderAt(seed), g1 = rng.gauss(), g2 = rng.gauss(), g3 = rng.gauss(), r1 = rng();
        const range = CFG.PATCH_TURN * Math.pow(1 - o, CFG.PATCH_TURN_SHAPE);
        const th = this.gridAngle + (K > 1 ? (spread[i] * range + g1 * Math.min(2, 0.15 * range)) * DEG : 0);
        if (!groups[i].length) groups[i].push(seed);
        frames.push({ th, anchor: seeds.length > 1 ? seed : this.center, guide: null, patch: i, pts: groups[i], o,
          scaleMul: seeds.length > 1 ? clampTo(Math.exp(g2 * CFG.PATCH_SCALE_SD * (1 - o)), 0.8, 1.3) : 1,
          aspect: clampTo(lerp(CFG.CUT_ASPECT[0], CFG.CUT_ASPECT[1], o) * Math.exp(g3 * CFG.PATCH_ASPECT_SD * (1 - o)), 1.1, 2.4),
          brick: r1 < brickAt(o) });
      }
      frames.forEach((F, i) => {
        F.i = i;
        F.u = { x: Math.cos(F.th), y: Math.sin(F.th) }; F.n = { x: -F.u.y, y: F.u.x };
        F.across = p => p.x * F.n.x + p.y * F.n.y; F.along = p => p.x * F.u.x + p.y * F.u.y;
        F.at = (off, t) => ({ x: F.n.x * off + F.u.x * t, y: F.n.y * off + F.u.y * t });
        F.c0 = F.across(F.anchor); F.a0 = F.along(F.anchor);
        // Main roads running along or across this lattice: it bends onto them, so blocks front the
        // road instead of being sliced by it.
        F.mAlong = []; F.mAcross = []; const tol = Math.sin(12 * DEG);
        for (const [p, q] of mains.all) {
          const d = angleOf(p, q) - F.th;
          if (Math.abs(Math.sin(d)) < tol) { const [s, e] = F.along(p) <= F.along(q) ? [p, q] : [q, p]; F.mAlong.push({ s1: F.along(s), s2: F.along(e), c1: F.across(s), c2: F.across(e) }); }
          else if (Math.abs(Math.cos(d)) < tol) { const [s, e] = F.across(p) <= F.across(q) ? [p, q] : [q, p]; F.mAcross.push({ c1: F.across(s), c2: F.across(e), s1: F.along(s), s2: F.along(e) }); }
        }
      });

      const build = (scale, F, earlier) => {
        const { across, along, at, c0, a0, mAlong, mAcross } = F;
        const side = side0 * scale * F.scaleMul;
        const W = side / Math.sqrt(F.aspect), L = side * Math.sqrt(F.aspect);  // block width (across) and length
        let lo, hi, alo, ahi;
        if (F.guide) {                                                 // a road's own blocks: a few strips either side of it
          const s = F.guide.map(along); lo = c0 - CFG.CUT_DISTRICT_DEPTH * W; hi = c0 + CFG.CUT_DISTRICT_DEPTH * W; alo = Math.min(...s) - 0.5 * L; ahi = Math.max(...s) + 0.5 * L;
        } else {                                                       // a patch: the land nearest its seed
          lo = hi = across(F.pts[0]); alo = ahi = along(F.pts[0]);
          for (const p of F.pts) { const c = across(p), t = along(p); if (c < lo) lo = c; if (c > hi) hi = c; if (t < alo) alo = t; if (t > ahi) ahi = t; }
        }
        const kLo = Math.floor((lo - c0) / W) - 1, kHi = Math.ceil((hi - c0) / W) + 1;
        const jLo = Math.floor((alo - a0) / L) - 2, jHi = Math.ceil((ahi - a0) / L) + 2;
        const nk = kHi - kLo + 1, nj = jHi - jLo + 1;
        const jit = o => jitterAt(o) * CFG.CUT_SPACING_JITTER, maxShift = 0.42 * W;
        // Long streets: joints a block-length apart, each shifted sideways by a little noise (more at
        // low order) — or onto a main road running that way within half a block.
        const shift = new Float64Array(nk * nj);
        for (let k = kLo; k <= kHi; k++) for (let j = jLo; j <= jHi; j++) {
          const off = c0 + k * W, t = a0 + j * L, g = rng.gauss();
          let s = Math.max(-maxShift, Math.min(maxShift, g * jit(this.orderAt(at(off, t))) * W * 1.6)), best = 0.5 * W;
          for (const m of mAlong) {
            if (t < m.s1 - 2 || t > m.s2 + 2) continue;
            const c = m.s2 > m.s1 ? m.c1 + (m.c2 - m.c1) * (t - m.s1) / (m.s2 - m.s1) : m.c1, d = c - off;
            if (Math.abs(d) < best) { best = Math.abs(d); s = d; }
          }
          shift[(k - kLo) * nj + (j - jLo)] = s;
        }
        // the wandering line of long street k (straight from joint to joint)
        const wander = (k, t) => {
          const x = (t - a0) / L, j = Math.max(jLo, Math.min(jHi - 1, Math.floor(x))), f = x - j, i = (k - kLo) * nj + (j - jLo);
          return c0 + k * W + shift[i] * (1 - f) + shift[i + 1] * f;
        };
        // Cross streets: one per strip and joint. At low order a strip's cross streets sit half a block
        // off its neighbour's (T-junctions, like bricks), each a little out of place and tilted; at high
        // order they line up into crossroads, square. Two that nearly line up are made to. A main road
        // crossing the strip within half a block takes the cross street's place.
        const ta = new Float64Array(nk * nj), tb = new Float64Array(nk * nj), onR = new Uint8Array(nk * nj);
        let brick = 0;
        for (let k = kLo; k < kHi; k++) {
          if (F.brick) brick = 1 - brick;
          for (let j = jLo; j <= jHi; j++) {
            const t0 = a0 + (j + 0.5 * brick) * L, mid = c0 + (k + 0.5) * W, r1 = rng(), g = rng.gauss();
            const o = this.orderAt(at(mid, t0));
            const t = t0 + jitterAt(o) * (r1 - 0.5) * 0.3 * L;
            const tilt = Math.max(-0.25 * L, Math.min(0.25 * L, Math.tan(g * jitterAt(o) * CFG.CUT_WOBBLE * DEG) * W));
            let A = t - tilt / 2, B = t + tilt / 2, best = 0.5 * L, onRoad = false;
            for (const m of mAcross) {
              if (mid < m.c1 - 2 || mid > m.c2 + 2) continue;
              const sAt = c => m.c2 > m.c1 ? m.s1 + (m.s2 - m.s1) * (c - m.c1) / (m.c2 - m.c1) : m.s1, d = sAt(mid) - t0;
              if (Math.abs(d) < best) { best = Math.abs(d); A = sAt(mid - W / 2); B = sAt(mid + W / 2); onRoad = true; }
            }
            if (!onRoad && k > kLo) {                                  // nearly opposite one from the strip before: line up
              let near = null;
              for (let jj = Math.max(jLo, j - 1); jj <= Math.min(jHi, j + 1); jj++) { const d = tb[(k - 1 - kLo) * nj + (jj - jLo)] - A; if (Math.abs(d) < 0.2 * L && (near === null || Math.abs(d) < Math.abs(near))) near = d; }
              if (near !== null) { A += near; B += near; }
            }
            const i = (k - kLo) * nj + (j - jLo); ta[i] = A; tb[i] = B; onR[i] = onRoad ? 1 : 0;
          }
        }
        // A long street bends only where cross streets meet it: it runs straight from junction to
        // junction, through the points its wandering line gives there.
        const knots = [];
        for (let k = kLo; k <= kHi; k++) {
          const ts = [];
          for (let j = jLo; j <= jHi; j++) { if (k < kHi) ts.push(ta[(k - kLo) * nj + (j - jLo)]); if (k > kLo) ts.push(tb[(k - 1 - kLo) * nj + (j - jLo)]); }
          ts.sort((p, q) => p - q);
          knots.push({ t: ts, c: ts.map(t => wander(k, t)) });
        }
        const pos = (k, t) => {
          const K = knots[k - kLo], n = K.t.length;
          if (t <= K.t[0]) return K.c[0]; if (t >= K.t[n - 1]) return K.c[n - 1];
          let a = 0, b = n - 1; while (b - a > 1) { const m = (a + b) >> 1; if (K.t[m] <= t) a = m; else b = m; }
          const d = K.t[b] - K.t[a]; return d > 1e-9 ? K.c[a] + (K.c[b] - K.c[a]) * (t - K.t[a]) / d : K.c[a];
        };
        const P = (k, t) => at(pos(k, t), t);
        const TA = (k, j) => ta[(k - kLo) * nj + (j - jLo)], TB = (k, j) => tb[(k - kLo) * nj + (j - jLo)];
        // Move cell (k, j)'s cross street at one end outward by g blocks (the hub's cell: its square is a
        // little longer than the blocks beside it) — if that street isn't a main road and the cell
        // beyond it stays at least 0.6 of a block long.
        const stretch = (k, j, end, g) => {
          const jj = j + end, beyond = jj + (end ? 1 : -1);
          if (k < kLo || k >= kHi || jj < jLo || jj > jHi || beyond < jLo || beyond > jHi) return false;
          const i = (k - kLo) * nj + (jj - jLo), o = (k - kLo) * nj + (beyond - jLo);
          if (onR[i] || Math.min(Math.abs(ta[o] - ta[i]), Math.abs(tb[o] - tb[i])) - g * L < 0.6 * L) return false;
          const d = (end ? 1 : -1) * g * L; ta[i] += d; tb[i] += d; return true;
        };
        // Candidate cells.
        const cells = new Map(), list = [], thinned = [];
        const why = { inside: 0, small: 0, wet: 0, taken: 0, other: 0, thin: 0 };
        const rCorr = lerp(CFG.CORRIDOR[0], CFG.CORRIDOR[1], this.suburb) * W;   // the corridor along a main road, in strips of blocks
        const span = Math.max(1, this.extent - (this.frontFrom || 0));
        const inQuad = (p, q) => { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); if (c > 0) { if (s < 0) return false; s = 1; } else if (c < 0) { if (s > 0) return false; s = -1; } } return true; };
        for (let k = kLo; k < kHi; k++) for (let j = jLo; j < jHi; j++) {
          const q = [P(k, TA(k, j)), P(k + 1, TB(k, j)), P(k + 1, TB(k, j + 1)), P(k, TA(k, j + 1))];
          const c = centroid(q);
          if (!this.inSection(c)) continue;
          if (F.patch !== undefined && seedOf(c) !== F.patch) continue;
          if (F.guide && (along(c) < alo || along(c) > ahi || Math.abs(across(c) - c0) > CFG.CUT_DISTRICT_DEPTH * W)) continue;
          why.inside++;
          if (Math.abs(signedArea(q)) < 0.4 * W * L) { why.small++; continue; }
          const probe = [c];
          for (let i = 0; i < 4; i++) {
            const m = { x: (q[i].x + q[(i + 1) % 4].x) / 2, y: (q[i].y + q[(i + 1) % 4].y) / 2 };
            probe.push({ x: c.x + (q[i].x - c.x) * 0.75, y: c.y + (q[i].y - c.y) * 0.75 }, { x: c.x + (m.x - c.x) * 0.75, y: c.y + (m.y - c.y) * 0.75 });
          }
          if (!q.every(dry) || !probe.every(dry)) { why.wet++; continue; }
          if (probe.some(inTaken)) { why.taken++; continue; }
          const x0 = Math.min(...q.map(p => p.x)), x1 = Math.max(...q.map(p => p.x)), y0 = Math.min(...q.map(p => p.y)), y1 = Math.max(...q.map(p => p.y));
          // not on top of a cell of a lattice laid out before this one
          let clash = false;
          for (const e of earlier) {
            if (e.x1 < x0 || e.x0 > x1 || e.y1 < y0 || e.y0 > y1) continue;
            if (inQuad(e.c, q) || probe.some(p => inQuad(p, e.q)) || e.q.some(p => inQuad(p, q))) { clash = true; break; }
          }
          if (clash) { why.other++; continue; }
          const thin = rng() < CFG.EDGE_THIN * (1 - this.inwardness(c));          // the city's edge thins out
          const dm = dMain(c);
          const cell = { f: F.i, k, j, c, q, x0, x1, y0, y1, key: F.i + ':' + k + ':' + j,
            near: Math.min(dm, this.nearestStreet(c, 1.5 * L)) < 1.5 * L,     // touches the city or a main road
            pr: 0.5 * (1 - 0.8 * this.suburb) * Math.max(0, dist(c, this.origin) - (this.frontFrom || 0)) / span   // outward from the city…
              + (this.zoneAt(c) === 2 ? 0.35 : 0)                                // resistance land: later
              + (Number.isFinite(dm) ? this.suburb * 1.2 * Math.min(3, dm / rCorr) : 0)   // …but suburbs keep to the main roads
              + this.suburb * CFG.SUBURB_RIBBONS * ((((k % 3) + 3) % 3) === 2 ? 1 : 0)   // …in ribbons two strips deep, the third strip left open
              + (1 - this.inwardness(c)) * (0.4 + 1.0 * rng()) + 0.15 * rng() };   // the city's edge: later, and raggedly
          if (thin) { why.thin++; cell.inward = this.inwardness(c); thinned.push(cell); continue; }
          cells.set(cell.key, cell); list.push(cell);
        }
        return { F, W, L, P, TA, TB, stretch, cells, list, thinned, why };
      };
      const buildAll = scale => {
        const lats = [], all = [];
        for (const F of frames) { const lat = build(scale, F, all); lats.push(lat); for (const c of lat.list) all.push(c); for (const c of lat.thinned) all.push(c); }
        // the edge thins out, but never so far that the hour can't hold its blocks
        const thinned = lats.flatMap(l => l.thinned).sort((p, q) => q.inward - p.inward);
        let total = lats.reduce((s, l) => s + l.list.length, 0);
        while (total < CFG.CUT_MIN_CELLS && thinned.length) { const c = thinned.shift(), lat = lats[c.f]; lat.cells.set(c.key, c); lat.list.push(c); lat.why.thin--; total++; }
        return { lats, total, scale };
      };
      let plan = buildAll(1);
      for (let tries = 0, scale = 1; tries < 3 && plan.total < CFG.CUT_MIN_CELLS; tries++) {   // too few whole cells: finer blocks
        scale *= Math.max(0.7, Math.sqrt(Math.max(1, plan.total) / (1.15 * CFG.CUT_MIN_CELLS)));
        plan = buildAll(scale);
      }
      const lats = plan.lats, list = lats.flatMap(l => l.list);
      // The hub's own cell is built first (it becomes the hour's square): the cell holding the hub, or
      // failing that the nearest one.
      const hub = this.squareAt[this.sid];
      if (hub && list.length) {
        const holds = c => { let sgn = 0; for (let i = 0; i < 4; i++) { const a = c.q[i], b = c.q[(i + 1) % 4], z = (b.x - a.x) * (hub.y - a.y) - (b.y - a.y) * (hub.x - a.x); if (z > 0) { if (sgn < 0) return false; sgn = 1; } else if (z < 0) { if (sgn > 0) return false; sgn = -1; } } return true; };
        let cell = list.find(holds);
        if (!cell) for (const l of lats) { const c = l.thinned.find(x => !l.cells.has(x.key) && holds(x)); if (c) { l.cells.set(c.key, c); l.list.push(c); list.push(c); cell = c; break; } }
        if (!cell) cell = list.reduce((a, b) => dist(b.c, hub) < dist(a.c, hub) ? b : a);
        cell.pr = -10; cell.near = true;
        this.squareAt[this.sid] = { x: cell.c.x, y: cell.c.y };
        const lat = lats[cell.f], { k, j } = cell;
        for (const end of [0, 1]) lat.stretch(k, j, end, CFG.SQUARE_GROW);                       // a little larger than its neighbours
        // the square is that cell, whatever is drawn first round it
        if (!this.squares.some(x => x.sid === this.sid)) {
          const q = [lat.P(k, lat.TA(k, j)), lat.P(k + 1, lat.TB(k, j)), lat.P(k + 1, lat.TB(k, j + 1)), lat.P(k, lat.TA(k, j + 1))];
          this.openSquare({ pts: q, area: Math.abs(signedArea(q)) });
          this.squareAt[this.sid] = centroid(q);
        }
      }
      const W = side0 * plan.scale / Math.sqrt(aspect), L = side0 * plan.scale * Math.sqrt(aspect);   // the hour's typical block
      this.blockArea = W * L; this.minBlock = 0.4 * this.blockArea; this.maxBlock = 2.5 * this.blockArea;
      // Which cells are built, and in what order: spreading from cells that touch the city or a main road.
      const want = Math.min(list.length, Math.round(lerp(list.length, Math.max(CFG.CUT_MIN_CELLS, CFG.CUT_SUBURB_KEEP * list.length), this.suburb)));
      const kept = [], front = [], state = new Map();
      for (const c of list) if (c.near) { front.push(c); state.set(c.key, 1); }
      // (each lattice builds its share of the hour's cells, so a thinned-out hour is spread over all its land)
      const share = lats.map(l => Math.ceil(want * l.list.length / Math.max(1, list.length))), built = lats.map(() => 0);
      while (kept.length < want) {
        let bi = -1; for (let i = 0; i < front.length; i++) if (built[front[i].f] < share[front[i].f] && (bi < 0 || front[i].pr < front[bi].pr)) bi = i;
        if (bi < 0) {                                                // nothing within reach: start again at the best cell left
          let best = null; for (const c of list) if (!state.has(c.key) && built[c.f] < share[c.f] && (!best || c.pr < best.pr)) best = c;
          if (!best) break;
          front.push(best); state.set(best.key, 1); bi = front.length - 1;
        }
        const c = front.splice(bi, 1)[0];
        c.rank = kept.length; kept.push(c); state.set(c.key, 2); built[c.f]++;
        for (const [dk, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const o = lats[c.f].cells.get(c.f + ':' + (c.k + dk) + ':' + (c.j + dj));
          if (o && !state.has(o.key)) { front.push(o); state.set(o.key, 1); }
        }
      }
      // The streets those cells need. Long streets are drawn in pieces that stop at every junction, so
      // cross streets always meet them at a corner; shared sides are drawn once.
      const need = new Map(), junc = new Map(), crossNeed = new Map(), done = new Map();
      const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
      for (const c of kept) {
        const { f, k, j, rank } = c, { TA, TB } = lats[f];
        add(need, f + ':' + k, [TA(k, j), TA(k, j + 1), rank]); add(need, f + ':' + (k + 1), [TB(k, j), TB(k, j + 1), rank]);
        for (const jj of [j, j + 1]) {
          add(junc, f + ':' + k, TA(k, jj)); add(junc, f + ':' + (k + 1), TB(k, jj));
          const key = f + ':' + k + ':' + jj; if (!crossNeed.has(key)) crossNeed.set(key, { f, k, j: jj, rank });
        }
      }
      const items = [], segs = [];
      const emit = (pts, rank, ck, f) => {
        let run = null, mine = [];
        const flush = () => { if (run && run.length > 1) { const it = { pts: run, rank, ck, seq: items.length }; items.push(it); for (const s of mine) s.item = it; } run = null; mine = []; };
        for (let i = 0; i + 1 < pts.length; i++) {
          for (const [p, q] of this.uncoveredRuns(pts[i], pts[i + 1], mains.planned)) {
            if (run && run[run.length - 1] === p) run.push(q); else { flush(); run = [p, q]; }
            const s = { p, q, f, item: null }; segs.push(s); mine.push(s);
          }
        }
        flush();
      };
      const longPiece = (f, k, t1, t2, rank, ck = 'long') => {
        const id = f + ':' + k, P = lats[f].P;
        let todo = [[t1, t2]];
        for (const [d1, d2] of done.get(id) || []) todo = todo.flatMap(([x, y]) => (d2 <= x || d1 >= y) ? [[x, y]] : [[x, Math.min(y, d1)], [Math.max(x, d2), y]].filter(([p, q]) => q - p > 0.5));
        for (const [x, y] of todo) {
          const marks = (junc.get(id) || []).filter(t => t > x + 0.75 && t < y - 0.75).sort((p, q) => p - q);
          const ts = [x]; for (const t of marks) if (t - ts[ts.length - 1] > 0.75 && y - t > 0.75) ts.push(t); ts.push(y);
          emit(ts.map(t => P(k, t)), rank, ck, f);
          add(done, id, [x, y]);
        }
      };
      const crossDone = new Set();
      for (const c of kept) {
        const { f, k, j, rank } = c, { P, TA, TB } = lats[f];
        longPiece(f, k, TA(k, j), TA(k, j + 1), rank); longPiece(f, k + 1, TB(k, j), TB(k, j + 1), rank);
        for (const jj of [j, j + 1]) {
          const key = f + ':' + k + ':' + jj; if (crossDone.has(key)) continue; crossDone.add(key);
          emit([P(k, TA(k, jj)), P(k + 1, TB(k, jj))], rank, 'cross', f);
        }
      }
      // Links: a street that ends with open land ahead and an existing street, a planned main road or a
      // street of another lattice within reach carries on to it — unless that would cut across water,
      // high ground, another new block or a block already there.
      const reach = 1.2 * L, lattice = segs.slice();
      const link = (E, d, rank, f) => {
        if (this.nearestStreet(E, 1.5) < 1.5 || inTaken({ x: E.x + d.x * 2, y: E.y + d.y * 2 })) return;
        const far = { x: E.x + d.x * reach, y: E.y + d.y * reach };
        const hit = this.castRay(E, Math.atan2(d.y, d.x), reach);
        let best = hit ? hit.d : Infinity, target = null;
        for (const [p, q] of mains.planned) { const h = segHit(E, far, p, q); if (h && h.t * reach > 0.01 && h.t * reach < best) best = h.t * reach; }
        for (const s of lattice) { if (s.f === f) continue; const h = segHit(E, far, s.p, s.q); if (h && h.t * reach > 1 && h.t * reach < best) { best = h.t * reach; target = s; } }
        if (!(best >= 3 && best <= reach)) return;
        const H = { x: E.x + d.x * best, y: E.y + d.y * best };
        for (let s = 3; s < best; s += 3) if (!dry({ x: E.x + d.x * s, y: E.y + d.y * s })) return;
        for (const s of lattice) { if (s.f !== f) continue; const h = segHit(E, H, s.p, s.q); if (h && h.t * best > 1) return; }
        items.push({ pts: [E, H], rank, ck: 'link', seq: items.length, after: target }); segs.push({ p: E, q: H, f, item: null });
      };
      for (const [id, ivs] of need) {
        const [fs, ks] = id.split(':'), f = +fs, k = +ks, { P, F } = lats[f], u = F.u;
        const sorted = ivs.slice().sort((p, q) => p[0] - q[0]);
        let cur = null; const runs = [];
        for (const [x, y, r] of sorted) {
          if (cur && x <= cur.y + 0.5) { if (y > cur.y) { cur.y = y; cur.ry = r; } }
          else { cur = { x, y, rx: r, ry: r }; runs.push(cur); }
        }
        for (const r of runs) { link(P(k, r.x), { x: -u.x, y: -u.y }, r.rx, f); link(P(k, r.y), u, r.ry, f); }
      }
      const sideHas = (f, k, strip, t) => {                           // does a taken cell in `strip` border long street k at t?
        const { TA, TB } = lats[f];
        for (const c of kept) {
          if (c.f !== f || c.k !== strip) continue;
          const [x, y] = strip === k ? [TA(strip, c.j), TA(strip, c.j + 1)] : [TB(strip, c.j), TB(strip, c.j + 1)];
          if (t >= x - 0.5 && t <= y + 0.5) return true;
        }
        return false;
      };
      for (const { f, k, j, rank } of crossNeed.values()) {
        const { P, TA, TB } = lats[f];
        const A = P(k, TA(k, j)), B = P(k + 1, TB(k, j)), l = dist(A, B) || 1, d = { x: (B.x - A.x) / l, y: (B.y - A.y) / l };
        if (!sideHas(f, k, k - 1, TA(k, j))) link(A, { x: -d.x, y: -d.y }, rank, f);
        if (!sideHas(f, k + 1, k + 1, TB(k, j))) link(B, d, rank, f);
      }
      // Spurs: at the city's edge, some streets carry on one block past the last blocks, into open land
      // (they enclose nothing; at dusk they are pushed out further).
      const keptKeys = new Set(kept.map(c => c.key));
      for (const lat of lats) for (const c of lat.list.concat(lat.thinned)) {
        if (keptKeys.has(c.key) || this.inwardness(c.c) >= 0.9) continue;
        const beside = keptKeys.has(c.f + ':' + c.k + ':' + (c.j - 1)) || keptKeys.has(c.f + ':' + c.k + ':' + (c.j + 1));
        const r1 = rng(), r2 = rng();
        if (!beside || r1 > CFG.EDGE_SPURS) continue;
        if (r2 < 0.5) longPiece(c.f, c.k, lat.TA(c.k, c.j), lat.TA(c.k, c.j + 1), kept.length + items.length, 'spur');
        else longPiece(c.f, c.k + 1, lat.TB(c.k, c.j), lat.TB(c.k, c.j + 1), kept.length + items.length, 'spur');
      }
      items.sort((p, q) => (p.rank - q.rank) || (p.seq - q.seq));
      let total = 0;
      for (const it of items) { it.plan = this.addPlan(it.pts, 'cut'); it.plan.ck = it.ck; total += polylineLength(it.pts); }
      for (const it of items) if (it.after && it.after.item && it.after.item.plan) it.plan.after = it.after.item.plan.id;   // a link waits for the street it ends on
      this.cutCount = items.length;
      this.cutLeft = kept.length; this.cutKept = kept.length; this.cutSid = this.sid;   // (see fillBlock)
      this.cutCells = lats.flatMap(l => l.list.concat(l.thinned.filter(c => !l.cells.has(c.key)))).map(c => [c.c.x, c.c.y, c.rank === undefined ? 0 : 1]);    // (for diagnostics)
      this.cutInfo = { candidates: list.length, kept: kept.length, lattices: lats.map(l => l.list.length), patches: seeds.length, turns: frames.filter(F => !F.guide).map(F => Math.round(wrap90(F.th - this.gridAngle) / DEG)), W: +W.toFixed(1), L: +L.toFixed(1), scale: +plan.scale.toFixed(2), why: lats.map(l => l.why), streets: items.length, length: Math.round(total), order: +o0.toFixed(2), suburb: +this.suburb.toFixed(2) };
      (this.cutLog = this.cutLog || {})[this.sid] = this.cutInfo;
      // the hour's budget follows from its cut streets: all of them built by about :48
      const dur = this.st.end - this.st.start;
      this.pacePerSec = Math.max(1e-6, total / (0.8 * dur));
      this.budget = 6 * 60 * this.pacePerSec;
    }
    // A gridded section's avenues: straight main roads along the grid axis and across it, every
    // AVENUE_M, on lines anchored at the market. Neighbouring sections with the same axis get the
    // same lines, so avenues run straight through from hour to hour.
    avenues() {
      if (!(this.gridStrength >= CFG.AVENUE_FROM) || this.gridAngle === undefined) return;
      const m = CFG.M_PER_PX, S = lerp(CFG.AVENUE_M, CFG.SUBURB_AVENUE_M, this.suburb || 0) / m, keep = CFG.ART_SPACING_M / m * 0.6;
      const cands = [];
      let dirs = [this.gridAngle, this.gridAngle + Math.PI / 2];
      if (this.suburb > 0.3) {                             // suburbs: only the main roads heading outward
        const out = angleOf(this.origin, this.box);
        dirs = [dirs.reduce((a, b) => Math.abs(Math.cos(a - out)) >= Math.abs(Math.cos(b - out)) ? a : b)];
      }
      for (const dir of dirs) {
        const u = { x: Math.cos(dir), y: Math.sin(dir) }, nrm = { x: -u.y, y: u.x };
        const along = p => p.x * u.x + p.y * u.y, across = p => p.x * nrm.x + p.y * nrm.y;
        const pts = this.section.poly.flat().map(([x, y]) => ({ x, y }));
        const c0 = across(this.center), lo = Math.min(...pts.map(across)), hi = Math.max(...pts.map(across));
        for (let k = Math.ceil((lo - c0) / S); c0 + k * S <= hi; k++) {
          const o = c0 + k * S;
          // where the line crosses the section's outline: alternate in/out intervals
          const ts = [];
          for (const poly of this.section.poly) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = { x: poly[j][0], y: poly[j][1] }, b = { x: poly[i][0], y: poly[i][1] };
            const da = across(a) - o, db = across(b) - o;
            if ((da > 0) === (db > 0)) continue;
            const f = da / (da - db);
            ts.push(along(a) + (along(b) - along(a)) * f);
          }
          ts.sort((p, q) => p - q);
          const at = t => ({ x: nrm.x * o + u.x * t, y: nrm.y * o + u.y * t });
          for (let i = 0; i + 1 < ts.length; i += 2) {
            // walk the interval, splitting it wherever the river or the high ground interrupts
            let start = null;
            const flush = (t1) => {
              if (start === null) return;
              const a = at(start), b = at(t1);
              if (t1 - start >= CFG.ART_MIN_LEN && !this.parallelArterialNear(at((start + t1) / 2), dir, keep)) cands.push([a, b]);
              start = null;
            };
            for (let t = ts[i] + 1; t <= ts[i + 1] - 1; t += 2) {
              const p = at(t), z = this.zoneAt(p);
              // not into the river or onto high ground; in the city, not into resistance land either
              // (suburban main roads do cross it, and development follows them)
              const ok = !this.nearRiver(p, this.riverBuffer) && z !== 3 && (z !== 2 || this.suburb > 0.3);
              if (ok && start === null) start = t;
              if (!ok) flush(t - 2);
            }
            flush(ts[i + 1] - 1);
          }
        }
      }
      // Keep only avenues that join the main-road network (directly or through another accepted
      // avenue), longest first, up to the day's cap.
      cands.sort((p, q) => dist(q[0], q[1]) - dist(p[0], p[1]));
      const accepted = [];
      let progress = true;
      while (progress && this.mainRoadsLeft() > 0) {
        progress = false;
        for (let i = 0; i < cands.length && this.mainRoadsLeft() > 0; i++) {
          let [a, b] = cands[i]; if (!a) continue;
          const extra = accepted.concat(this.sectionMainLines || []);
          if (!this.meetsMainRoads(a, b, extra)) {
            const ext = this.extendToNetwork(a, b, extra);   // carry it back along its line to the network
            if (!ext) continue;
            [a, b] = ext;
            // …but not alongside another main road
            const dir = angleOf(a, b), keepR = CFG.ART_SPACING_M / CFG.M_PER_PX;
            let alongside = false;
            for (const f of [0.15, 0.4, 0.65, 0.9]) {
              const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
              if (this.parallelArterialNear(p, dir, keepR)) { alongside = true; break; }
              if (extra.some(([u, v]) => Math.abs(Math.sin(angleOf(u, v) - dir)) < Math.sin(15 * DEG) && distToSeg(p, u, v) < keepR)) { alongside = true; break; }
            }
            if (alongside) continue;
          }
          const plan = this.addPlan([a, b], 'thoroughfare'); plan.width = CFG.WIDTH0 + CFG.WIDTH_ROAD;
          accepted.push([a, b]); (this.sectionMainLines = this.sectionMainLines || []).push([a, b]); cands[i] = [null]; this.mainRoadCount = (this.mainRoadCount || 0) + 1; progress = true;
        }
      }
    }
    // ── 4h. Character: measure it, and fade streets that pull away from it ──
    features(edgeList) {
      const deg = new Map(), inc = new Map();
      for (const e of edgeList) for (const n of [e.a, e.b]) {
        deg.set(n, (deg.get(n) || 0) + 1);
        if (!inc.has(n)) inc.set(n, []);
        inc.get(n).push(e);
      }
      let street = 0, dead = 0, junc = 0, four = 0, devSum = 0, devN = 0;
      for (const [nid, d] of deg) {
        const n = this.nodes.get(nid); if (!n) continue;
        if (d !== 2) street++;
        if (d === 1 && !n.gate) dead++;
        if (d >= 3) {
          junc++; if (d >= 4) four++;
          const angs = inc.get(nid).map(e => this.dirAt(n, e)).sort((a, b) => a - b);
          for (let i = 0; i < angs.length; i++) {
            let gap = (angs[(i + 1) % angs.length] - angs[i]) / DEG; if (gap <= 0) gap += 360;
            if (gap <= 135) { devSum += Math.abs(gap - 90); devN++; }
          }
        }
      }
      const bins = new Array(36).fill(0); let arc = 0, chord = 0, lenSum = 0;
      for (const e of edgeList) {
        for (let i = 1; i < e.pts.length; i++) {
          const L = dist(e.pts[i - 1], e.pts[i]); if (!L) continue;
          const a = ((angleOf(e.pts[i - 1], e.pts[i]) / DEG) % 360 + 360) % 360;
          bins[Math.floor(a / 10) % 36] += L; bins[Math.floor(((a + 180) % 360) / 10)] += L;
        }
        arc += e.len; chord += dist(e.pts[0], e.pts[e.pts.length - 1]); lenSum += e.len;
      }
      const tot = bins.reduce((s, v) => s + v, 0);
      if (!tot || !street) return null;
      let H = 0; for (const v of bins) if (v > 0) { const p = v / tot; H -= p * Math.log(p); }
      return {
        entropy: H / Math.log(36),
        deadEnd: dead / street,
        jDev: devN ? devSum / devN : this.T.jDev,
        segLen: median(edgeList.map(e => e.len)) * CFG.M_PER_PX,
        circuity: chord ? arc / chord : 1,
        fourWay: junc ? four / junc : 0,
      };
    }
    distance(f) {
      let d = 0;
      for (const k in WEIGHT) d += WEIGHT[k] * ((f[k] - this.T[k]) / SCALE[k]) ** 2;
      return d;
    }
    // Would removing this edge cut the network in two?
    isBridge(e) {
      const seen = new Set([e.a]), stack = [e.a];
      while (stack.length && seen.size < 600) {
        const n = this.nodes.get(stack.pop());
        for (const id of n.edges) {
          if (id === e.id) continue;
          const x = this.edges.get(id); if (!x || x.state === 'FADING') continue;
          const o = x.a === n.id ? x.b : x.a;
          if (o === e.b) return false;
          if (!seen.has(o)) { seen.add(o); stack.push(o); }
        }
      }
      return true;
    }
    prune(c, radius = CFG.WINDOW_R) {
      const inWin = [...this.hash.query(c.x - radius, c.y - radius, c.x + radius, c.y + radius)]
        .map(id => this.edges.get(id))
        .filter(e => e && this.isActive(e) && dist(e.pts[Math.floor(e.pts.length / 2)], c) < radius);
      const base = this.features(inWin); if (!base) return;
      const dBase = this.distance(base), gains = [];
      let cands = inWin.filter(e => e.state === 'PROVISIONAL' && !e.frozen && !e.main && !e.arterial && e.sid === this.sid);
      while (cands.length > 40) cands.splice(Math.floor(this.rng() * cands.length), 1);
      for (const e of cands) {
        const A = this.nodes.get(e.a), B = this.nodes.get(e.b);
        if (A.gate || B.gate) continue;
        const deadEnd = this.degree(A) === 1 || this.degree(B) === 1;
        if (!deadEnd && this.isBridge(e)) continue;               // never strand part of the city
        const f = this.features(inWin.filter(x => x !== e)); if (!f) continue;
        const gain = dBase - this.distance(f);
        if (gain > CFG.PRUNE_EPS) gains.push({ e, gain });
      }
      gains.sort((p, q) => q.gain - p.gain);
      for (const g of gains.slice(0, CFG.MAX_PRUNE)) this.fade(g.e);
    }

    // ── 4i. The clock drives everything through here ─────────
    // Advance to `seconds` since 12:00, in fixed sub-steps.
    get growEnd() { return this.schedule[this.schedule.length - 1].end; }
    get duskEnd() { return this.growEnd + CFG.DUSK_LENGTH; }
    advanceTo(seconds) {
      const target = Math.floor(Math.min(seconds, this.duskEnd) / CFG.SUB + 1e-9);
      while (this.sub < target) {
        this.sub++;
        this.update(CFG.SUB);
        if (this.sub % 10 !== 0) continue;
        const s = this.sub / 10;                                 // whole seconds since midnight
        if (this.finished) {                                     // dusk: tidy up the edges
          this.tickDusk(s - this.growEnd);
          if (s >= this.duskEnd && !this.duskDone) { this.freeze(); this.duskDone = true; }
          continue;
        }
        const inSec = s - this.st.start;
        // The rate eases off through the hour (1.4× at the start to 0.6× at the end; it averages 1×).
        const pace = this.pacePerSec * (1.4 - 0.8 * Math.min(1, inSec / (this.st.end - this.st.start)));
        this.budget = Math.min(this.budget + pace, 120 * this.pacePerSec);
        // behind the clock: top the budget up so the hour can still reach its 60 blocks
        if (inSec % 30 === 0 && Math.floor(inSec / 60) - this.filled >= 1) this.budget = Math.max(this.budget, 60 * this.pacePerSec);
        if (this.isOrganic()) this.organicTick(inSec);
        else {
          if (this.touchesRiver && inSec > 0 && inSec % 300 === 0) this.waterLanes();
          this.runPlans();
        }
        if (inSec > 0 && inSec % 60 === 0) this.tickMinute(inSec / 60);
        else if (!this.walkerOnly()) this.tickSecond();
        if (s >= this.st.end) {                                  // this section's time is up
          if (this.stage + 1 < this.schedule.length) this.enterStage(this.stage + 1);
          else if (!this.finished) { this.freeze(); this.finished = true; this.enterDusk(); }
        }
      }
    }

    // ── 4k. Dusk: after the last section, streets push out past the edge and leftovers fill ──
    enterDusk() {
      this.sid = 'dusk'; this.section = null; this.duskFaces = null;
      if (!this.bySection.has('dusk')) this.bySection.set('dusk', new Set());
    }
    inAnySection(p) {
      for (const id in this.sections) if (inPolys(p, this.sections[id].poly)) return true;
      return false;
    }
    outsideCity(p) {
      return p.x > 4 && p.y > 4 && p.x < this.mapW - 4 && p.y < this.mapH - 4 && !this.inAnySection(p) && !this.inRiver(p)
        && this.zoneAt(p) !== 3;                             // never onto the high ground
    }
    tickDusk(d) {
      if (d === 60) this.buildEmbankment();
      if (d === 30) this.joinMainRoads();
      this.runPlans();
      if (d % CFG.DUSK_EXTEND_EVERY === 0) this.extendOutward();
      if (d % CFG.DUSK_FILL_EVERY === 0) this.fillLeftover(d);
    }
    // Carry a street on past the city's edge, or branch off one that already has been.
    extendOutward() {
      const ahead = (n, h, k) => ({ x: n.x + Math.cos(h) * k, y: n.y + Math.sin(h) * k });
      if (true) {                                          // carry streets on past the edge (no side branches)
        const ends = [];
        for (const n of this.nodes.values()) {
          if (n.edges.size !== 1 || (n.outskirt || 0) >= 3) continue;
          const e = this.edges.get([...n.edges][0]); if (!e || !this.isActive(e)) continue;
          if (!(n.gate || n.outskirt || e.kind === 'cut:spur')) continue;
          const h = this.dirAt(n, e) + Math.PI;
          if (this.outsideCity(ahead(n, h, 4))) ends.push({ n, h });
        }
        if (!ends.length) return;
        const x = ends[Math.floor(this.rng() * ends.length)];
        const h = this.align(x.h + this.rng.gauss() * 4 * DEG);
        const side = Math.sqrt(this.blockArea || 400);
        if (this.nearestParallel({ x: x.n.x + Math.cos(h) * side, y: x.n.y + Math.sin(h) * side }, h, side, new Set(x.n.edges)) < side) return;   // a block apart
        this.startBranch(x.n, h, side * this.rng.range(1, 2), new Set(x.n.edges), { free: true, depth: (x.n.outskirt || 0) + 1 });
      } else {
        const own = this.sectionEdges().filter(e => e.len > 2 * this.junctionGap);
        if (!own.length) return;
        const e = own[Math.floor(this.rng() * own.length)];
        const f = this.rng.range(0.3, 0.7), a = e.pts[0], b = e.pts[e.pts.length - 1];
        const P = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        const h = this.align(angleOf(a, b) + (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2);
        if (!this.outsideCity(ahead(P, h, 4))) return;
        const node = this.splitEdge(e, 0, P);
        this.startBranch(node, h, this.segLenPx * this.rng.range(0.3, 1.0), new Set(node.edges), { free: true, depth: 3 });
      }
    }
    // Fill the next enclosed area that's still empty, working outward from the centre.
    fillLeftover(d) {
      if (!this.duskFaces || d % 600 === 0) {
        const minA = 0.5 * (this.blockCap || 800) * CFG.FACE_SHARE;   // no tiny leftovers
        this.duskFaces = this.findFaces().faces.filter(f => f.area >= minA && f.area <= 25000 && this.inAnySection(f.c))
          .sort((p, q) => dist(p.c, this.center) - dist(q.c, this.center));
      }
      while (this.duskFaces.length) {
        const f = this.duskFaces.shift();
        f.key = [...f.edgeIds].sort((a, b) => a - b).join(',');
        if (this.filledKeys.has(f.key)) continue;
        if (![...f.edgeIds].every(id => this.edges.has(id))) continue;       // changed since
        if (this.blocks.some(bl => pointInPoly(f.c, bl.ring))) continue;      // already shaded
        if (this.inSquare(f)) continue;                                        // a square stays open
        if (compactness([f.pts]) < CFG.MIN_COMPACT_ANY) continue;          // no odd shapes
        const block = { pts: f.pts.map(p => ({ x: p.x, y: p.y })), ring: f.pts.map(p => [p.x, p.y]),
                        area: f.area, c: f.c, born: this.time, sid: 'dusk' };
        this.blocks.push(block); this.filledKeys.add(f.key);
        this.events.push({ type: 'block', block, t: this.time });
        return;
      }
    }
    // ── 4j. Saving and restoring, so a page reload needn't replay the whole morning ──
    snapshot() {
      return JSON.stringify({
        seed: this.seed, sub: this.sub, stage: this.stage, rng: this.rng.getState(), nextId: this.nextId,
        filled: this.filled, debt: this.debt, quotaLog: this.quotaLog, finished: !!this.finished, duskDone: !!this.duskDone,
        farNode: this.farNode ? this.farNode.id : null, stats: this.stats,
        nodes: [...this.nodes.values()].map(n => [n.id, n.x, n.y, [...n.edges], n.gate ? 1 : 0, n.bank ? 1 : 0, n.riverside ? 1 : 0, n.outskirt || 0]),
        // (kept small: a straight street's points are its two junctions; flags are saved only when set;
        //  a block's outline is saved once; a finished plan no longer needs its points)
        edges: [...this.edges.values()].map(e => {
          const A = this.nodes.get(e.a), B = this.nodes.get(e.b), p = e.pts;
          const straight = p.length === 2 && A && B && p[0].x === A.x && p[0].y === A.y && p[1].x === B.x && p[1].y === B.y;
          const o = { id: e.id, a: e.a, b: e.b, state: e.state, alpha: e.alpha, width: e.width, born: e.born, sid: e.sid };
          if (!straight) o.pts = p;
          for (const k of ['frozen', 'bridge', 'main', 'road', 'arterial', 'netSeed']) if (e[k]) o[k] = 1;
          if (e.kind) o.kind = e.kind;
          return o;
        }),
        fading: [...this.fading],
        bySection: [...this.bySection].map(([k, v]) => [k, [...v]]),
        blocks: this.blocks.map(b => Object.assign({}, b, { ring: undefined })), filledKeys: [...this.filledKeys],
        squares: this.squares, squareAt: this.squareAt,
        entries: this.entries.map(n => n.id),
        growing: this.growing.map(b => Object.assign({}, b, { start: b.start.id, target: b.target ? b.target.id : null, ignore: [...b.ignore] })),
        waterLaneLines: this.waterLaneLines || [], mainRoadCount: this.mainRoadCount || 0, netSeeded: !!this.netSeeded,
        budget: this.budget, hour: { pacePerSec: this.pacePerSec, gridAngle: this.gridAngle, gridStrength: this.gridStrength, blockArea: this.blockArea, minBlock: this.minBlock, maxBlock: this.maxBlock, cutLeft: this.cutLeft, cutSid: this.cutSid, cutKept: this.cutKept, cutCount: this.cutCount, quarterOwed: !!this.quarterOwed },
        organic: this.walk ? {
          G: f32ToB64(this.walk.G), walkers: this.walk.walkers,
          houses: this.houses, queue: this.houseQueue.map(h => this.houses.indexOf(h)),
          hubs: this.hubs, villagePts: this.villagePts, landings: this.landings, farHub: this.farHub, gateAngles: this.gateAngles, gates: this.gates,
          plans: this.plans.map(p => p.done ? Object.assign({}, p, { pts: [] }) : p), planQueue: this.planQueue,
          walls: this.walls, laneEnds: [...this.laneEnds], stageHouses: this.stageHouses || 0, seq: this.seq || 0,
        } : null,
      });
    }
    static restore(json, geometry) {
      const d = JSON.parse(json);
      const sim = new CitySim({ seed: d.seed, geometry });
      sim.nodes = new Map(); sim.edges = new Map(); sim.hash = new SpatialHash(12);
      for (const [id, x, y, edges, gate, bank, riverside, outskirt] of d.nodes)
        sim.nodes.set(id, { id, x, y, edges: new Set(edges), gate: !!gate, bank: !!bank, riverside: !!riverside, outskirt: outskirt || 0 });
      for (const e of d.edges) {
        if (!e.pts) { const A = sim.nodes.get(e.a), B = sim.nodes.get(e.b); e.pts = [{ x: A.x, y: A.y }, { x: B.x, y: B.y }]; }
        for (const k of ['frozen', 'bridge', 'main', 'road', 'arterial', 'netSeed']) { if (e[k]) e[k] = true; else delete e[k]; }
        sim.edges.set(e.id, e); sim.hash.add(e); e.len = polylineLength(e.pts);
      }
      sim.fading = new Set(d.fading);
      sim.bySection = new Map(d.bySection.map(([k, v]) => [k, new Set(v)]));
      sim.blocks = d.blocks; for (const b of sim.blocks) b.ring = b.pts.map(p => [p.x, p.y]);
      sim.squares = d.squares || []; if (d.squareAt) sim.squareAt = d.squareAt;
      sim.stats = d.stats; sim.quotaLog = d.quotaLog;
      sim.filledKeys = new Set(d.filledKeys || []);
      sim.enterStageQuietly(d.stage);
      sim.sub = d.sub; sim.nextId = d.nextId; sim.filled = d.filled; sim.debt = d.debt; sim.finished = d.finished;
      if (d.finished) { sim.enterDusk(); sim.duskDone = d.duskDone; }
      sim.waterLaneLines = d.waterLaneLines || []; sim.mainRoadCount = d.mainRoadCount || 0;
      sim.netSeeded = !!d.netSeeded;
      if (d.budget !== undefined) sim.budget = d.budget;
      if (d.hour) Object.assign(sim, d.hour);
      sim.rng.setState(d.rng);
      sim.farNode = d.farNode ? sim.nodes.get(d.farNode) : null;
      sim.entries = d.entries.map(id => sim.nodes.get(id)).filter(Boolean);
      sim.growing = d.growing.map(b => Object.assign(b, { start: sim.nodes.get(b.start), target: b.target ? sim.nodes.get(b.target) : undefined, ignore: new Set(b.ignore) }))
        .filter(b => b.start);
      if (d.organic && sim.walk) {
        const o = d.organic;
        sim.walk.G = b64ToF32(o.G); sim.walk.walkers = o.walkers; sim.walk.gx = null;
        sim.houses = o.houses; sim.houseQueue = o.queue.map(i => sim.houses[i]).filter(Boolean);
        sim.hubs = o.hubs; sim.villagePts = o.villagePts; sim.landings = o.landings; sim.farHub = o.farHub; sim.gateAngles = o.gateAngles; sim.gates = o.gates;
        sim.plans = o.plans; sim.planQueue = o.planQueue; sim.walls = o.walls;
        sim.laneEnds = new Set(o.laneEnds); sim.stageHouses = o.stageHouses; sim.seq = o.seq;
      }
      sim.frozenVersion++;
      return sim;
    }
    // Set up a section's rules without freezing, seeding or anything else that changes the city.
    enterStageQuietly(k) {
      this.quiet = true; this.stage = -1; this.enterStage(k); this.quiet = false;
    }

    // A summary for the display.
    status() {
      return { id: this.sid, t: this.t, quota: this.quota, filled: this.filled, minutes: this.st.minutes,
               minute: Math.floor((this.time - this.st.start) / 60), done: !!this.finished, duskDone: !!this.duskDone };
    }
  }


  // ─────────────────────────────────────────────────────────────
  // 5. The old city: the active-walker model (walker.py, round 2)
  //    Helbing, Keltsch & Molnár (1997): walkers between houses, the market, villages and
  //    gates wear trails; well-used trails become the main streets. Then every house far from
  //    a street gets a straight lane (our extension). Villages, walls and linking as in round 2.
  // ─────────────────────────────────────────────────────────────
  const WALK = {
    cellM: 15,            // m: size of a trail-field cell (walker.py uses 5 m; coarser keeps it quick)
    sigmaM: 40,           // m: σ, the reach of a trail's pull
    kappa: 10,            // κ = IT/σ (round-2 best)
    lambda: 600,          // λ = V⁰T/σ, held constant as in the paper
    v0M: 5,               // m per step
    spawn: 1.5,           // trips started per step (Poisson mean)
    gradCap: 0.9,         // trail pull capped below the destination pull
    arriveM: 15,          // m: a walker has arrived within this distance
    plazaM: 30,           // m: radius of the market square (no trail forms on it)
    traffic: 1 / 150,     // a cell used once per 150 steps is a street
    stepsPerStage: 800,   // walker steps per stage (a stage is 5 minutes in section 1)
    stages: 12,           // stages per organic section
    frontFull: 9,         // stage by which growth reaches the section's edge (walker.py: 12)
    housesPerStage: 60,   // new houses per stage (scaled by the section's land area)
    villages: { '06': 1, '07': 1, '08': 1 },    // secondary seeds (round 2: 3 villages)
    walkerOnly: ['05'],   // sections grown by the walker model alone…
    infillAfter: 0.15,    // …until this share of their time; after it, street-by-street infill joins in
    villageRM: [364, 520],// m from the centre: where the first villages sit (0.28–0.40 L)
    gateRM: 611,          // m: the first gates (0.47 L); later rings push them outward
    nGates: 5,
    wallsAt: [4, 8],      // section 1 stages after which a wall is built (round 2 best)
    wallSides: 9,
    // The river (river.py / river3.py, v3 with a late embankment):
    landings: 4,          // landing places on the near bank, each tied to the market…
    landingSpacingM: 170, //   …this far apart along the bank, around the point nearest the market
    landingShare: 0.12,   // share of trips market ↔ a landing
    farShare: 0.05,       // share of trips market ↔ the far-bank destination (castle, monastery)
    farDistM: [150, 250], // how far beyond the bridge that destination is
    bankPushM: 20,        // walkers within this of the water are pushed back…
    bankSlideM: 10,       // …and within this they can only slide along the bank
  };
  // After the old city: destinations further out keep the walkers' trails converging and parting all
  // day. Every other ring has a hub (a village the city grows out to and absorbs), and roads lead
  // out of town through gates. Each hour the walkers cross the land about to be built, between the
  // newest blocks, the hubs and the gates; their best-worn trails become that hour's main roads.
  const DAYWALK = {
    hubs: ['09', '11', '13', '15', '17'],   // (06–08 have the old city's villages)
    cellM: 28,            // m: a coarser trail field, over the whole city
    steps: 600,           // walker steps each hour
    spawn: 1.5,
    minLenM: 160,         // a trail shorter than this isn't worth a main road
    straightenM: [45, 140], // m: trails are straightened to pieces that stray no more than this (from order 0 to 1)
    reachM: 110,          // m: a trail ending this close to a street is carried on to it
  };
  const LANE = {
    jitter: 6,            // deg: wobble off square (round 2 best)
    medianM: 50, cv: 0.6, // lognormal lane length
    snapM: 12,            // m: a free lane end this close to a street joins it
    accessM: 40,          // m: only houses further than this from a street get a lane
    minGapM: 18,          // m: reject lanes that run alongside a street this close
    pConnect: 0.9,        // most lanes run on until they meet a street
    maxReachM: 200,       // m: how far a lane will run to meet one
    pCross: 0.3,          // sometimes it carries on across the first street it meets
    linkM: 40,            // m: a lane end that still meets nothing links to a street this close
    minLenM: 15,
  };
  // Water lanes (river3.water_lanes): from the water's edge straight inland to the first street,
  // where people live along the bank.
  const WATER = { spacingM: 55, reachM: 110, builtM: 70, minGapM: 20, bridgeClearM: 15 };

  // The trail field G on a grid, and the walkers that wear it.
  class TrailField {
    constructor(sim, center, halfPx, opts = {}) {
      const m = CFG.M_PER_PX;
      this.opts = opts;
      this.sim = sim; this.cell = (opts.cellM || WALK.cellM) / m;     // px per cell
      this.n = Math.ceil((2 * halfPx) / this.cell);
      this.x0 = center.x - halfPx; this.y0 = center.y - halfPx;
      this.sigma = WALK.sigmaM / m; this.v0 = WALK.v0M / m;            // px
      const sigC = this.sigma / this.cell;                             // σ in cells
      this.T = WALK.lambda * this.sigma / this.v0;                     // λ = V0 T/σ  (T in steps)
      this.I = WALK.kappa * this.sigma / this.T;                       // κ = I T/σ
      this.gmax = sigC / 2;                                            // saturated trail pulls with |∇V| ~ 1
      const x = this.I * this.T * WALK.traffic;
      this.thr = this.gmax * x / (this.gmax + x);
      this.G = new Float32Array(this.n * this.n);
      this.blocked = new Uint8Array(this.n * this.n);                  // water and the market square
      // (the day's field reads water from the zone map, which is much quicker than the river's outline)
      const wet = opts.zones ? p => sim.zoneAt(p) === 4 : p => sim.inRiver(p);
      const nearWet = opts.zones ? p => { const b = sim.riverBuffer; for (const [dx, dy] of [[0, 0], [b, 0], [-b, 0], [0, b], [0, -b]]) if (sim.zoneAt({ x: p.x + dx, y: p.y + dy }) === 4) return true; return false; } : p => sim.nearRiver(p, sim.riverBuffer);
      this.wet = wet;
      for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
        const p = this.center(i, j);
        if (dist(p, sim.center) < WALK.plazaM / m || nearWet(p)) this.blocked[j * this.n + i] = 1;
      }
      this.boxR = Math.max(1, Math.round(sigC * 0.9));                 // box blur ≈ the exp(−r/σ) kernel
      this.walkers = [];
      this.riverGrids(sim);
    }
    // The river on the grid (river.py): water cells, the bridge, which bank each cell is on, and
    // each cell's distance to the water with the direction away from it.
    riverGrids(sim) {
      const n = this.n, N = n * n, m = CFG.M_PER_PX;
      this.water = new Uint8Array(N); this.bridge = new Uint8Array(N); this.side = new Int8Array(N);
      const bn = sim.bridgeAt ? sim.bridgeAt.near : null, bf = sim.bridgeAt ? sim.bridgeAt.far : null;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const p = this.center(i, j), q = j * n + i;
        if (this.wet(p)) this.water[q] = 1;
        if (bn && distToSeg(p, bn, bf) < this.cell * 0.75) { this.bridge[q] = 1; this.water[q] = 0; }
      }
      // banks: flood the land (not the bridge) from the market, then from across the river
      // (only over the map: beyond its edge there is no river to stop the flood)
      const offMap = new Uint8Array(N);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p = this.center(i, j); if (p.x < 0 || p.y < 0 || p.x > sim.mapW || p.y > sim.mapH) offMap[j * n + i] = 1; }
      const flood = (start, val) => {
        if (start < 0 || this.water[start] || this.bridge[start]) return;
        const stack = [start]; this.side[start] = val;
        while (stack.length) {
          const q = stack.pop(), i = q % n, j = (q - i) / n;
          for (const r of [i > 0 ? q - 1 : -1, i < n - 1 ? q + 1 : -1, j > 0 ? q - n : -1, j < n - 1 ? q + n : -1]) {
            if (r < 0 || this.side[r] || this.water[r] || this.bridge[r] || offMap[r]) continue;
            this.side[r] = val; stack.push(r);
          }
        }
      };
      flood(this.idx(sim.center), 1);
      if (bf) flood(this.idx({ x: bf.x + (bf.x - bn.x) * 0.3, y: bf.y + (bf.y - bn.y) * 0.3 }), -1);
      // (the day's field: high ground is an obstacle too — walkers go round it, as round water)
      if (this.opts.hills) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (!this.bridge[j * n + i] && sim.zoneAt(this.center(i, j)) === 3) this.water[j * n + i] = 1;
      // distance to water (chamfer 3–4, in metres) and the unit direction away from it
      const INF = 1e9, d = new Float64Array(N).fill(INF);
      for (let q = 0; q < N; q++) if (this.water[q]) d[q] = 0;
      const a = this.cell * m, b = a * Math.SQRT2;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const q = j * n + i; let v = d[q];
        if (i > 0) v = Math.min(v, d[q - 1] + a);
        if (j > 0) { v = Math.min(v, d[q - n] + a); if (i > 0) v = Math.min(v, d[q - n - 1] + b); if (i < n - 1) v = Math.min(v, d[q - n + 1] + b); }
        d[q] = v;
      }
      for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
        const q = j * n + i; let v = d[q];
        if (i < n - 1) v = Math.min(v, d[q + 1] + a);
        if (j < n - 1) { v = Math.min(v, d[q + n] + a); if (i < n - 1) v = Math.min(v, d[q + n + 1] + b); if (i > 0) v = Math.min(v, d[q + n - 1] + b); }
        d[q] = v;
      }
      this.dw = d; this.awx = new Float32Array(N); this.awy = new Float32Array(N);
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const q = j * n + i, gx = d[q + 1] - d[q - 1], gy = d[q + n] - d[q - n], g = Math.hypot(gx, gy);
        if (g > 0 && d[q] < 1e8) { this.awx[q] = gx / g; this.awy[q] = gy / g; }
      }
    }
    sideOf(p) { const q = this.idx(p); return q < 0 ? 0 : this.side[q]; }
    center(i, j) { return { x: this.x0 + (i + 0.5) * this.cell, y: this.y0 + (j + 0.5) * this.cell }; }
    idx(p) {
      const i = Math.floor((p.x - this.x0) / this.cell), j = Math.floor((p.y - this.y0) / this.cell);
      return (i < 0 || j < 0 || i >= this.n || j >= this.n) ? -1 : j * this.n + i;
    }
    // V ≈ the trail field blurred over ~σ; its gradient, in units of σ.
    gradient() {
      const n = this.n, r = this.boxR;
      let a = Float32Array.from(this.G), b = new Float32Array(n * n);
      for (let pass = 0; pass < 3; pass++) {
        for (let j = 0; j < n; j++) {                   // rows
          let s = 0; const row = j * n;
          for (let i = -r; i < n; i++) {
            if (i + r < n) s += a[row + i + r];
            if (i - r - 1 >= 0) s -= a[row + i - r - 1];
            if (i >= 0) b[row + i] = s / (2 * r + 1);
          }
        }
        for (let i = 0; i < n; i++) {                   // columns
          let s = 0;
          for (let j = -r; j < n; j++) {
            if (j + r < n) s += b[(j + r) * n + i];
            if (j - r - 1 >= 0) s -= b[(j - r - 1) * n + i];
            if (j >= 0) a[j * n + i] = s / (2 * r + 1);
          }
        }
      }
      const k = 2 * Math.PI * (this.sigma / this.cell) / 2;      // ∫exp(−r)d²r = 2π; central difference
      this.gx = new Float32Array(n * n); this.gy = new Float32Array(n * n);
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const q = j * n + i;
        this.gx[q] = (a[q + 1] - a[q - 1]) * k; this.gy[q] = (a[q + n] - a[q - n]) * k;
      }
    }
    // Walk for a number of steps (eqs 1–4 of the paper, with walker.py's fixes).
    run(steps, trip) {
      const rng = this.sim.rng, arrive = Math.max(WALK.arriveM / CFG.M_PER_PX, 1.2 * this.cell), decay = 1 / this.T;
      for (let s = 0; s < steps; s++) {
        // new trips: Poisson(spawn)
        let L = Math.exp(-WALK.spawn), k = 0, p = rng();
        while (p > L) { k++; p *= rng(); }
        for (let q = 0; q < k; q++) {
          const t = trip(); if (!t) continue;
          const w = this.route(t[0], t[1]); if (!w) continue;
          // a walker that hasn't arrived after three times its trip's length is retired (it's stuck)
          let L = dist(w, w.d), prev = w.d; for (const n of w.next) { L += dist(prev, n); prev = n; }
          w.life = Math.ceil(3 * L / this.v0) + 50;
          this.walkers.push(w);
        }
        const every = this.opts.gradEvery || 8;
        if (s % every === 0 || !this.gx) {                // regrowth (eq 1), applied in batches of 8
          const f = Math.pow(1 - decay, s === 0 ? 0 : every);
          if (f < 1) for (let q = 0; q < this.G.length; q++) this.G[q] *= f;
          this.gradient();
        }
        const keep = [];
        for (const w of this.walkers) {
          const dx = w.d.x - w.x, dy = w.d.y - w.y, dd = Math.hypot(dx, dy) || 1e-9;
          let ex = dx / dd, ey = dy / dd;                               // unit vector to destination
          const c = this.idx(w);
          if (c >= 0) {
            let gx = this.gx[c], gy = this.gy[c];
            const gm = Math.hypot(gx, gy);
            if (gm > WALK.gradCap) { gx *= WALK.gradCap / gm; gy *= WALK.gradCap / gm; }
            ex += gx; ey += gy;
            // the bank pushes walkers back, and close to it they can only slide along it
            if (!this.bridge[c] && this.dw[c] < WALK.bankPushM) {
              const ax = this.awx[c], ay = this.awy[c], push = Math.max(0, 1 - this.dw[c] / WALK.bankPushM) * 1.5;
              ex += push * ax; ey += push * ay;
              const inward = ex * ax + ey * ay;
              if (inward < 0 && this.dw[c] < WALK.bankSlideM) { ex -= inward * ax; ey -= inward * ay; }
            }
          }
          const em = Math.hypot(ex, ey) || 1e-9;
          const nx = w.x + this.v0 * ex / em, ny = w.y + this.v0 * ey / em;   // eq (4)
          const cn = this.idx({ x: nx, y: ny });
          if (!(cn >= 0 && this.water[cn])) { w.x = nx; w.y = ny; }          // never into the water
          const c2 = this.idx(w);
          if (c2 >= 0 && !this.blocked[c2]) {                            // eq (1), deposit
            this.G[c2] = Math.min(this.gmax, this.G[c2] + this.I * (1 - this.G[c2] / this.gmax));
          }
          if (Math.hypot(w.d.x - w.x, w.d.y - w.y) <= arrive && w.next && w.next.length) w.d = w.next.shift();   // on to the next waypoint
          if (Math.hypot(w.d.x - w.x, w.d.y - w.y) > arrive && c2 >= 0 && --w.life > 0) keep.push(w);
        }
        this.walkers = keep;
      }
    }
    // A trip across the river goes bridge end → bridge end → destination (river.py _route).
    route(a, b) {
      const sa = this.sideOf(a), sb = this.sideOf(b), sim = this.sim;
      if (sa === 0 && this.water[this.idx(a)]) return null;                 // starting in the water
      if (!sim.bridgeAt || sa === 0 || sb === 0 || sa === sb) return { x: a.x, y: a.y, d: b, next: [] };
      const [n1, n2] = sa === 1 ? [sim.bridgeAt.near, sim.bridgeAt.far] : [sim.bridgeAt.far, sim.bridgeAt.near];
      return { x: a.x, y: a.y, d: { x: n1.x, y: n1.y }, next: [{ x: n2.x, y: n2.y }, b] };
    }
    // Trail cells: well-used, on this section's land, and not already a street.
    trailMask(inside) {
      const n = this.n, m = new Uint8Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const q = j * n + i;
        if (this.G[q] <= this.thr || this.blocked[q]) continue;
        const p = this.center(i, j);
        if (!inside(p)) continue;
        if (this.sim.nearestStreet(p, this.cell * 1.2) < this.cell * 1.2) continue;
        m[q] = 1;
      }
      return m;
    }
  }

  // Thin a mask to one-cell-wide lines (Zhang–Suen), then trace them into polylines.
  function skeletonLines(mask, n) {
    const m = Uint8Array.from(mask), at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n) ? 0 : m[j * n + i];
    let changed = true;
    while (changed) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        const del = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          if (!m[j * n + i]) continue;
          const P = [at(i, j - 1), at(i + 1, j - 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), at(i - 1, j + 1), at(i - 1, j), at(i - 1, j - 1)];
          const B = P.reduce((a, b) => a + b, 0);
          if (B < 2 || B > 6) continue;
          let A = 0; for (let k = 0; k < 8; k++) if (!P[k] && P[(k + 1) % 8]) A++;
          if (A !== 1) continue;
          if (pass === 0 ? (P[0] * P[2] * P[4] || P[2] * P[4] * P[6]) : (P[0] * P[2] * P[6] || P[0] * P[4] * P[6])) continue;
          del.push(j * n + i);
        }
        for (const q of del) m[q] = 0;
        if (del.length) changed = true;
      }
    }
    const nb = (q) => { const i = q % n, j = (q - i) / n, out = [];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && at(i + di, j + dj)) out.push((j + dj) * n + i + di);
      return out; };
    const deg = q => nb(q).length, seen = new Set(), lines = [];
    const isNode = q => deg(q) !== 2;
    const walk = (a, b) => {
      const path = [a, b]; seen.add(a + ':' + b); seen.add(b + ':' + a);
      let prev = a, cur = b;
      while (!isNode(cur)) {
        const nx = nb(cur).find(x => x !== prev && !seen.has(cur + ':' + x));
        if (nx === undefined) break;
        seen.add(cur + ':' + nx); seen.add(nx + ':' + cur); prev = cur; cur = nx; path.push(cur);
        if (cur === a) break;
      }
      return path;
    };
    for (let q = 0; q < n * n; q++) if (m[q] && isNode(q)) for (const x of nb(q)) if (!seen.has(q + ':' + x)) lines.push(walk(q, x));
    for (let q = 0; q < n * n; q++) if (m[q] && !isNode(q)) for (const x of nb(q)) if (!seen.has(q + ':' + x)) lines.push(walk(q, x));   // loops
    return lines.map(path => path.map(q => [q % n, Math.floor(q / n)]));
  }

  // The organic sections' behaviour, added to CitySim.
  Object.assign(CitySim.prototype, {
    isOrganic() { return !this.finished && this.t < CFG.ORGANIC_UNTIL; },
    // Section 1 is walker.py's old core exactly. The later organic rings add the walker's main
    // streets, villages and house lanes to the usual street-by-street growth, which fills them.
    walkerOnly() { return this.isOrganic() && WALK.walkerOnly.includes(this.sid) && this.progress() < WALK.infillAfter; },

    // Once, at the start: the trail field, the market, villages, gates and the first houses.
    organicSetup() {
      const m = CFG.M_PER_PX, rng = this.rng;
      const organic = this.schedule.filter(s => s.t < CFG.ORGANIC_UNTIL).map(s => s.id);
      let half = 0;
      for (const id of organic) for (const poly of this.sections[id].poly) for (const [x, y] of poly) half = Math.max(half, dist({ x, y }, this.center));
      this.walk = new TrailField(this, this.center, half + 40);
      this.houses = []; this.houseQueue = []; this.plans = []; this.planQueue = []; this.walls = [];
      this.laneEnds = new Set();
      const addHouse = (p, sid) => { const h = { x: p.x, y: p.y, sid, done: false }; this.houses.push(h); return h; };
      // The market and a few houses around it.
      for (let k = 0; k < 12; k++) {
        const a = rng() * 2 * Math.PI, r = rng.range(40, 70) / m;
        addHouse({ x: this.center.x + r * Math.cos(a), y: this.center.y + r * Math.sin(a) }, this.schedule[0].id);
      }
      // Villages: each in its own section, which the city absorbs when it gets there.
      this.hubs = [{ x: this.center.x, y: this.center.y }];
      for (const id of organic) for (let v = 0; v < (WALK.villages[id] || 0); v++) {
        const S = this.sections[id];
        for (let tries = 0; tries < 400; tries++) {
          const a = rng() * 2 * Math.PI, r = S.rIn + rng.range(0.25, 0.7) * (S.rOut - S.rIn);
          const p = { x: this.center.x + r * Math.cos(a), y: this.center.y + r * Math.sin(a) };
          if (!inPolys(p, S.poly) || this.nearRiver(p, 20)) continue;
          this.hubs.push(p);
          if (parseInt(id, 10) % 2 === 1) this.squareAt[id] = { x: p.x, y: p.y };
          for (let k = 0; k < 6; k++) addHouse({ x: p.x + rng.gauss() * 30 / m, y: p.y + rng.gauss() * 30 / m }, id);
          break;
        }
      }
      this.villagePts = this.hubs.slice(1);
      this.squareAt[this.schedule[0].id] = { x: this.center.x, y: this.center.y };   // the market square
      this.placeRiverHubs();
      this.placeDayHubs();
      for (const h of this.dayHubs) this.squareAt[h.sid] = { x: h.x, y: h.y };
      // Gates: five roads out of town, plus the river crossing.
      this.gateAngles = [];
      const a0 = rng() * 2 * Math.PI;
      for (let k = 0; k < WALK.nGates; k++) this.gateAngles.push(a0 + k * 2 * Math.PI / WALK.nGates + rng.gauss() * 0.25);
      this.placeGates(WALK.gateRM / m);
    },
    // The river's destinations (river3.py): landings on the near bank, spread along it around the
    // point nearest the market, and a castle or monastery on the far side, beyond the bridge.
    placeRiverHubs() {
      const m = CFG.M_PER_PX, rng = this.rng, f = this.walk;
      this.landings = []; this.farHub = null;
      // the near bank as a path: river outline points just outside the water, on the market's side
      const R = this.river, bank = [];
      for (let i = 0; i < R.length; i++) {
        const p = { x: R[i][0], y: R[i][1] }, q = { x: R[(i + 1) % R.length][0], y: R[(i + 1) % R.length][1] };
        const L = dist(p, q), steps = Math.max(1, Math.ceil(L / 3));
        for (let k = 0; k < steps; k++) {
          const a = { x: p.x + (q.x - p.x) * k / steps, y: p.y + (q.y - p.y) * k / steps };
          const nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L;
          for (const sgn of [1, -1]) {                         // step off the water, onto land
            const b = { x: a.x + sgn * nx * 8, y: a.y + sgn * ny * 8 };   // ~35 m from the water
            if (!this.inRiver(b) && f.sideOf(b) === 1) { bank.push(b); break; }
          }
        }
      }
      if (bank.length) {
        let s = 0; const cum = [0];
        for (let i = 1; i < bank.length; i++) { s += Math.min(dist(bank[i - 1], bank[i]), 6); cum.push(s); }
        let i0 = 0; bank.forEach((b, i) => { if (dist(b, this.center) < dist(bank[i0], this.center)) i0 = i; });
        const n = WALK.landings, sp = WALK.landingSpacingM / m;
        for (let k = 0; k < n; k++) {
          const target = cum[i0] + (k - (n - 1) / 2) * sp + rng.gauss() * 25 / m;
          let best = 0; cum.forEach((c, i) => { if (Math.abs(c - target) < Math.abs(cum[best] - target)) best = i; });
          const p = bank[best];
          if (this.bridgeAt && dist(p, this.bridgeAt.near) < 30 / m) continue;
          this.landings.push({ x: p.x, y: p.y });
        }
      }
      if (this.bridgeAt) {
        const bn = this.bridgeAt.near, bf = this.bridgeAt.far, L = dist(bn, bf);
        const dx = (bf.x - bn.x) / L, dy = (bf.y - bn.y) / L;
        for (let k = 0; k < 50 && !this.farHub; k++) {
          const r = rng.range(WALK.farDistM[0], WALK.farDistM[1]) / m, lat = rng.gauss() * 60 / m;
          const q = { x: bf.x + dx * r - dy * lat, y: bf.y + dy * r + dx * lat };
          if (f.sideOf(q) === -1 && !this.nearRiver(q, 8)) this.farHub = q;
        }
      }
      this.hubs = this.hubs.concat(this.landings, this.farHub ? [this.farHub] : []);
    },
    // Gates at a given distance along the gate roads, moved inward if they'd land in the river
    // or across it.
    placeGates(R) {
      this.gates = [];
      for (const a of this.gateAngles) {
        for (let r = R; r > 40; r -= 5) {
          const p = { x: this.center.x + r * Math.cos(a), y: this.center.y + r * Math.sin(a) };
          if (!this.nearRiver(p, 10) && this.walk.idx(p) >= 0 && this.sameBank(p) && this.zoneAt(p) !== 3) { this.gates.push(p); break; }
        }
      }
      if (this.bridgeAt) this.gates.push({ x: this.bridgeAt.near.x, y: this.bridgeAt.near.y });
    },
    // Is p on the city's side of the river? (Walk from the centre toward it: no water on the way.)
    sameBank(p) {
      const d = dist(p, this.center), steps = Math.ceil(d / 4);
      for (let k = 1; k <= steps; k++) {
        const q = { x: this.center.x + (p.x - this.center.x) * k / steps, y: this.center.y + (p.y - this.center.y) * k / steps };
        if (this.inRiver(q)) return false;
      }
      return true;
    },

    // The day's hubs: one in every other ring after the old city, on dry buildable land as deep
    // inside its section as can be found.
    placeDayHubs() {
      const rng = this.rng; this.dayHubs = [];
      for (const id of DAYWALK.hubs) {
        const S = this.sections[id], st = this.schedule.find(x => x.id === id); if (!S || !st) continue;
        const pts = S.poly.flat(), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        let best = null;
        for (let k = 0; k < 250; k++) {
          const p = { x: rng.range(x0, x1), y: rng.range(y0, y1) };
          if (!inPolys(p, S.poly) || this.zoneAt(p) === 3 || this.zoneAt(p) === 2 || this.nearRiver(p, 20)) continue;
          let d = Infinity;
          for (const poly of S.poly) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSeg(p, { x: poly[j][0], y: poly[j][1] }, { x: poly[i][0], y: poly[i][1] }));
          d = Math.min(d, 45) + 0.02 * k;                           // deep enough is enough; then any of them
          if (!best || d > best.d) best = { p, d };
        }
        if (best) this.dayHubs.push({ x: best.p.x, y: best.p.y, sid: id, order: st.order });
      }
    },
    // The roads out of town: on each bank, look round the compass from its centre (the market; the
    // bridge's far end) in twelve sectors. Where the day's city reaches well out, the farthest dry
    // point of its outline in that sector is a gate.
    placeDayGates(f) {
      const out = [];
      const ok = p => p.x > 12 && p.y > 12 && p.x < this.mapW - 12 && p.y < this.mapH - 12 && this.zoneAt(p) !== 3 && !this.nearRiver(p, 12);
      const all = []; for (const id in this.sections) for (const poly of this.sections[id].poly) for (const [x, y] of poly) { const p = { x, y }; if (ok(p)) all.push(p); }
      for (const [side, c] of [[1, this.center], [-1, this.bridgeAt ? this.bridgeAt.far : null]]) {
        if (!c) continue;
        const pts = all.filter(p => f.sideOf(p) === side); if (!pts.length) continue;
        const dmax = Math.max(...pts.map(p => dist(p, c))), best = new Array(12).fill(null);
        for (const p of pts) { const s = Math.floor(((angleOf(c, p) / (2 * Math.PI) + 1) % 1) * 12) % 12; if (!best[s] || dist(p, c) > dist(best[s], c)) best[s] = p; }
        for (const g of best) if (g && dist(g, c) > 0.55 * dmax && !out.some(o => dist(o, g) < 150)) out.push({ x: g.x, y: g.y, side });
      }
      return out;
    },
    // Turn a trail's pieces toward the grid, by `o` (0 = as walked, 1 = exactly along the grid).
    snapTrail(pts, o) {
      if (this.gridAngle === undefined || !(o > 0) || pts.length < 2) return pts;
      const g = this.gridAngle, q = Math.PI / 2, lines = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], h = angleOf(a, b), target = g + Math.round((h - g) / q) * q;
        lines.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, h: h + Math.min(1, o) * wrapPi(target - h) });
      }
      const onto = (p, l) => { const t = (p.x - l.x) * Math.cos(l.h) + (p.y - l.y) * Math.sin(l.h); return { x: l.x + t * Math.cos(l.h), y: l.y + t * Math.sin(l.h) }; };
      const out = [onto(pts[0], lines[0])];
      for (let i = 1; i < lines.length; i++) {
        const A = lines[i - 1], B = lines[i], sn = Math.sin(B.h - A.h);
        if (Math.abs(sn) < 0.26) { out.push(onto(pts[i], A), onto(pts[i], B)); continue; }   // parallel: a short jog
        const t = ((B.x - A.x) * Math.sin(B.h) - (B.y - A.y) * Math.cos(B.h)) / sn;
        out.push({ x: A.x + t * Math.cos(A.h), y: A.y + t * Math.sin(A.h) });
      }
      out.push(onto(pts[pts.length - 1], lines[lines.length - 1]));
      return out.filter((p, i) => i === 0 || dist(p, out[i - 1]) > 2);
    },
    // An hour's walk (see DAYWALK): returns nothing; plans the hour's trail roads as main roads.
    dayWalk() {
      const m = CFG.M_PER_PX, rng = this.rng, k = this.stage;
      if (!this.walkDay) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const id in this.sections) for (const poly of this.sections[id].poly) for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        this.walkDay = new TrailField(this, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, Math.max(x1 - x0, y1 - y0) / 2 + 30, { cellM: DAYWALK.cellM, hills: true, zones: true, gradEvery: 16 });
      }
      const f = this.walkDay;
      f.G.fill(0); f.walkers = []; f.gx = null;
      // the roads already there are worn trails: walkers follow them as far as they go
      const roads = [...this.edges.values()].filter(e => this.isActive(e) && (e.arterial || e.bridge || e.netSeed || e.road));
      for (const e of roads) {
        const a = e.pts[0], b = e.pts[e.pts.length - 1], n = Math.max(1, Math.ceil(dist(a, b) / (f.cell / 2)));
        for (let i = 0; i <= n; i++) { const q = f.idx({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }); if (q >= 0 && !f.water[q]) f.G[q] = Math.max(f.G[q], 0.9 * f.gmax); }
      }
      // Where people are going: the hubs still ahead on this bank (the one in this section, or the
      // next one or two out in the country) and the roads out of town. Where they come from: the
      // newest blocks, the hubs the city has reached, the market.
      if (!this.dayGates) this.dayGates = this.placeDayGates(f);
      const side = f.sideOf(this.box) || f.sideOf(this.section.poly[0].map(([x, y]) => ({ x, y })).find(p => f.sideOf(p)) || this.center) || 1;
      for (const h of this.dayHubs) if (h.side === undefined) h.side = f.sideOf(h) || 1;
      const ahead = this.dayHubs.filter(h => h.order >= k && h.side === side).slice(0, 2);
      const reached = this.dayHubs.filter(h => h.order < k && h.side === side);
      const homes = side === 1 ? [this.center, ...this.villagePts, ...reached] : [...(this.farHub ? [this.farHub] : [this.bridgeAt.far]), ...reached];
      const gates = this.dayGates.filter(g => g.side === side);
      // The ways out of the built city toward this section: where main roads come near it — or, if
      // none does yet, the newest blocks beside it.
      const band = 60, exits = [];
      const outlines = this.section.poly.filter(poly => Math.abs(signedArea(poly.map(([x, y]) => ({ x, y })))) > 3000);   // (not its crumbs)
      const nearMe = (p, r) => { for (const poly of outlines) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (distToSeg(p, { x: poly[j][0], y: poly[j][1] }, { x: poly[i][0], y: poly[i][1] }) < r) return true; return false; };
      // (a main road's end comes first: the road is carried on from there)
      const netDeg = n => { let d = 0; for (const id of n.edges) { const e = this.edges.get(id); if (e && this.isActive(e) && this.onNetwork(e)) d++; } return d; };
      const roadEnds = [];
      for (const e of roads) if (this.onNetwork(e)) for (const id of [e.a, e.b]) {
        const n = this.nodes.get(id); if (!n || f.sideOf(n) !== side || !nearMe(n, band) || netDeg(n) !== 1) continue;
        if (!roadEnds.some(x => dist(x, n) < 30)) roadEnds.push({ x: n.x, y: n.y, h: this.dirAt(n, e) + Math.PI });
      }
      for (const n of roadEnds) exits.push(n);
      for (const e of roads) if (this.onNetwork(e)) for (const id of [e.a, e.b]) { const n = this.nodes.get(id); if (n && f.sideOf(n) === side && nearMe(n, band) && !exits.some(x => dist(x, n) < 45)) exits.push({ x: n.x, y: n.y }); }
      if (exits.length < 3) for (const b of this.blocks) if (b.c && b.sid !== 'dusk' && f.sideOf(b.c) === side && nearMe(b.c, band) && !exits.some(x => dist(x, b.c) < 60)) exits.push(b.c);
      const jit = p => ({ x: p.x + rng.gauss() * 8 / m, y: p.y + rng.gauss() * 8 / m });
      const pick = a => a[Math.floor(rng() * a.length)];
      const pickExit = () => roadEnds.length && rng() < 0.5 ? pick(roadEnds) : pick(exits);
      const nearest = (list, a) => list.reduce((best, h) => dist(h, a) < dist(best, a) ? h : best, list[0]);
      const trip = () => {
        const u = rng(); let a, b;
        if (u < 0.4 && exits.length && (ahead.length || gates.length)) { a = jit(pickExit()); b = ahead.length ? jit(nearest(ahead, a)) : pick(gates); }
        else if (u < 0.75 && exits.length && gates.length) { a = jit(pickExit()); b = pick(gates); }
        else if (u < 0.9 && ahead.length) { a = jit(pick(homes)); b = jit(pick(ahead)); }
        else if (ahead.length && gates.length) { a = jit(pick(ahead)); b = pick(gates); }
        else if (exits.length && gates.length) { a = jit(pick(exits)); b = pick(gates); }
        else return null;
        return rng() < 0.5 ? [a, b] : [b, a];
      };
      const spawn0 = WALK.spawn; WALK.spawn = DAYWALK.spawn;
      f.run(DAYWALK.steps, trip);
      WALK.spawn = spawn0;
      // the well-worn trails over this section's open land (and the gap before it)
      const mask = f.trailMask(p => this.zoneAt(p) !== 3 && (this.inSection(p) || nearMe(p, 40)));
      // Trace the trails, and join the pieces that carry straight on into one another.
      const raw = skeletonLines(mask, f.n).filter(l => l.length >= 2).sort((p, q) => q.length - p.length);
      const key = c => c[0] + ',' + c[1], ends = new Map();
      raw.forEach((l, i) => { for (const c of [l[0], l[l.length - 1]]) { if (!ends.has(key(c))) ends.set(key(c), []); ends.get(key(c)).push(i); } });
      const used = new Set(), chains = [];
      const heading = (l, fromEnd) => { const n = l.length, a = fromEnd ? l[Math.max(0, n - 5)] : l[Math.min(n - 1, 4)], b = fromEnd ? l[n - 1] : l[0]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
      for (let i = 0; i < raw.length; i++) {
        if (used.has(i)) continue; used.add(i);
        let chain = raw[i].slice();
        for (let pass = 0; pass < 2; pass++) {                      // grow the tail, then (reversed) the head
          for (let guard = 0; guard < 50; guard++) {
            const tail = chain[chain.length - 1], h = heading(chain, true);
            let best = null;
            for (const j of ends.get(key(tail)) || []) {
              if (used.has(j)) continue;
              const l = key(raw[j][0]) === key(tail) ? raw[j] : raw[j].slice().reverse();
              const turn = Math.abs(wrapPi(heading(l, false) + Math.PI - h));
              if (turn < 40 * DEG && (!best || turn < best.turn)) best = { j, l, turn };
            }
            if (!best) break;
            used.add(best.j); chain = chain.concat(best.l.slice(1));
          }
          chain.reverse();
        }
        chains.push(chain);
      }
      const reach0 = DAYWALK.reachM / m;
      const lines = chains.map(cells => {
        const mid = f.center(...cells[cells.length >> 1]);
        const pts = simplify(cells.map(([i, j]) => f.center(i, j)), lerp(DAYWALK.straightenM[0], DAYWALK.straightenM[1], this.orderAt(mid)) / m);
        let wear = 0; for (const [i, j] of cells) wear += f.G[j * f.n + i];
        const len = polylineLength(pts);
        let carries = false;
        for (const [end, next] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) for (const r of roadEnds)
          if (dist(r, end) < reach0 && Math.abs(wrapPi(angleOf(end, next) - r.h)) < 30 * DEG) carries = true;
        return { pts, len, carries, score: len * (0.5 + wear / cells.length / f.gmax) * (carries ? 2.5 : 1) };
      }).filter(l => l.pts.length >= 2).sort((p, q) => q.score - p.score);
      const spacing = CFG.ART_SPACING_M / m, made = [], reach = DAYWALK.reachM / m;
      const dryLine = (a, b) => { const n = Math.ceil(dist(a, b) / 3); for (let i = 0; i <= n; i++) { const p = { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }; if (this.zoneAt(p) === 3 || this.nearRiver(p, this.riverBuffer)) return false; } return true; };
      const netPoint = p => {                                       // the nearest point of the main-road network
        let best = null;
        for (const id of this.hash.query(p.x - reach, p.y - reach, p.x + reach, p.y + reach)) {
          const e = this.edges.get(id); if (!e || !this.isActive(e) || !this.onNetwork(e)) continue;
          const a = e.pts[0], b = e.pts[e.pts.length - 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)), q = { x: a.x + t * dx, y: a.y + t * dy }, d = dist(p, q);
          if (d <= reach && (!best || d < best.d)) best = { point: q, d };
        }
        return best;
      };
      const segsOf = P => P.slice(1).map((p, i) => [P[i], p]);
      // (if main roads are waiting at the section's edge to be carried on, the trails leave room for one)
      const waiting = [...this.nodes.values()].some(n => n.gate && n.edges.size === 1 && this.entersSection(n) && this.onNetwork(this.edges.get([...n.edges][0]) || {}));
      const most = waiting ? Math.max(1, CFG.MAIN_ROADS_PER_HOUR - 1) : CFG.MAIN_ROADS_PER_HOUR;
      const why = { short: 0, wet: 0, alongside: 0, unjoined: 0 };
      for (const line of lines) {
        if (this.mainRoadsLeft() <= 0 || made.length >= most) break;
        if (line.len < DAYWALK.minLenM / m) { why.short++; continue; }
        const pts = this.snapTrail(line.pts, this.orderAt(line.pts[Math.floor(line.pts.length / 2)]));
        // Each end near the city joins it: at the main-road network if that's within reach; otherwise at
        // the nearest street, and the streets from there to the network become main road too.
        const extra = made.flatMap(segsOf).concat(this.sectionMainLines || []);
        let joined = false; const promote = [], ends = {};
        for (const end of [0, pts.length - 1]) {
          const onPlanned = extra.some(([u, v]) => distToSeg(pts[end], u, v) < reach / 2);
          const q = netPoint(pts[end]);
          if (q) { if (q.d > 0.5) pts[end] = { x: q.point.x, y: q.point.y }; joined = true; ends[end] = true; continue; }
          if (onPlanned) { joined = true; ends[end] = true; continue; }
          const st = this.nearestStreetPoint(pts[end], reach);
          if (st) { pts[end] = { x: st.point.x, y: st.point.y }; promote.push(st); ends[end] = true; }
        }
        // A free end inside the section runs straight on to the section's far side (the next hour carries
        // the road on from there), stopping short of water and high ground.
        for (const end of [0, pts.length - 1]) {
          if (ends[end] || !this.inSection(pts[end])) continue;
          const prev = pts[end === 0 ? 1 : pts.length - 2], h = angleOf(prev, pts[end]);
          let L = this.distToEdge(pts[end], h); if (!Number.isFinite(L) || L > 400) continue;
          for (let d = 2; d < L; d += 2) { const p = { x: pts[end].x + Math.cos(h) * d, y: pts[end].y + Math.sin(h) * d }; if (this.nearRiver(p, this.riverBuffer) || this.zoneAt(p) === 3) { L = d - 4; break; } }
          if (L > 4) pts[end] = { x: pts[end].x + Math.cos(h) * (L + 1), y: pts[end].y + Math.sin(h) * (L + 1) };
        }
        if (!segsOf(pts).every(([a, b]) => dryLine(a, b))) { why.wet++; continue; }
        // not alongside another main road
        let alongside = false;
        for (const [a, b] of segsOf(pts)) {
          if (dist(a, b) < 30) continue;
          const dir = angleOf(a, b);
          for (const fr of [0.3, 0.7]) {
            const p = { x: a.x + (b.x - a.x) * fr, y: a.y + (b.y - a.y) * fr };
            if (this.parallelArterialNear(p, dir, spacing * 0.6)) alongside = true;
            if (extra.some(([u, v]) => Math.abs(Math.sin(angleOf(u, v) - dir)) < Math.sin(15 * DEG) && distToSeg(p, u, v) < spacing * 0.6)) alongside = true;
          }
        }
        if (alongside) { why.alongside++; continue; }
        if (!joined) {
          let path = null;
          for (const st of promote) {
            if (!this.edges.has(st.edge.id)) continue;
            // (through the old town a long winding way is fine; through a grid only a short one)
            path = this.promoteToNetwork(this.splitEdge(st.edge, st.seg, st.point), this.orderAt(st.point) < 0.25 ? 900 : 220);
            if (path) break;
          }
          if (!path) { why.unjoined++; continue; }
          this.markMainRoad(path);
        }
        const plan = this.addPlan(pts, 'thoroughfare'); plan.width = CFG.WIDTH0 + CFG.WIDTH_ROAD; plan.trail = true;
        this.mainRoadCount = (this.mainRoadCount || 0) + 1;
        made.push(pts);
        for (const sg of segsOf(pts)) this.sectionMainLines.push(sg);
      }
      this.dayTrail = { sid: this.sid, why, left: this.mainRoadsLeft(), lens: lines.slice(0, 6).map(l => Math.round(l.len)), hubs: this.dayHubs.map(h => [h.x, h.y]), gates: gates.map(g => [g.x, g.y]), exits: exits.map(g => [g.x, g.y]), lines: lines.map(l => l.pts.map(p => [p.x, p.y])), made: made.map(P => P.map(p => [p.x, p.y])),
        cell: f.cell, x0: f.x0, y0: f.y0, n: f.n, thr: f.thr, G: this.keepTrailField ? Array.from(f.G, v => +v.toFixed(3)) : null };
    },

    // At the start of an organic section.
    organicStart() {
      const st = this.st, S = this.section;
      this.stageLen = (st.minutes * 60) / WALK.stages;
      this.placeGates(Math.max(WALK.gateRM / CFG.M_PER_PX, S.rOut + 30));
      if (this.stage === 0) {                           // the market square: its edge is a street
        const r = (WALK.plazaM + WALK.cellM / 3) / CFG.M_PER_PX, pts = [];
        for (let k = 0; k <= 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; pts.push({ x: this.center.x + r * Math.cos(a), y: this.center.y + r * Math.sin(a) }); }
        this.addPlan(pts, 'wall');
      }
      // Houses already standing in this section (villages, earlier overspill) get their lanes now.
      for (const h of this.houses) if (!h.done && h.sid === this.sid) this.houseQueue.push(h);
    },

    // Every second of an organic section.
    organicTick(inSec) {
      const L = this.stageLen, stage = Math.floor(inSec / L);
      if (inSec % L === 0 && stage < WALK.stages) this.organicStage(stage);
      // Lanes for queued houses, spread through the stage.
      if (this.houseQueue.length) {
        const every = Math.max(1, Math.floor(L / Math.max(1, this.stageHouses || 1)));
        if (inSec % every === 0) this.tryLane(this.houseQueue.shift());
      }
      // Planned streets (trails, walls, lanes) grow a few at a time.
      this.runPlans();
    },
    // One stage (walker.py's run loop): walk, turn trails into streets, maybe a wall, settle houses.
    organicStage(stage) {
      if (stage > 0) { this.connectLanes(); this.waterLanes(); }   // end of the last stage
      const land = this.section.landArea / this.sections[this.schedule[0].id].landArea;
      this.walk.run(Math.round(WALK.stepsPerStage * Math.sqrt(land)), () => this.trip());
      this.trailsToPlans();
      if (this.stage === 0 && WALK.wallsAt.includes(stage + 1)) this.buildWall();
      this.stageHouses = this.settle(Math.round(WALK.housesPerStage * land));
    },

    // A trip (walker.py _trip): house → nearest hub, hub ↔ hub, market ↔ gate, house ↔ house.
    trip() {
      const rng = this.rng, H = this.houses, m = CFG.M_PER_PX, jit = p => ({ x: p.x + rng.gauss() * 8 / m, y: p.y + rng.gauss() * 8 / m });
      const swap = (a, b) => rng() < 0.5 ? [a, b] : [b, a];
      const r0 = rng();                                    // river3: market ↔ a landing, market ↔ the far bank
      if (this.landings && this.landings.length && r0 < WALK.landingShare)
        return swap(jit(this.center), this.landings[Math.floor(rng() * this.landings.length)]);
      if (this.farHub && r0 < WALK.landingShare + WALK.farShare) return swap(jit(this.center), jit(this.farHub));
      let a, b; const u = rng();
      if (u < 0.5 && H.length) {
        a = H[Math.floor(rng() * H.length)];
        b = jit(this.hubs.reduce((best, h) => dist(h, a) < dist(best, a) ? h : best, this.hubs[0]));
      } else if (u < 0.6 && this.hubs.length > 1) {
        const i = Math.floor(rng() * this.hubs.length); let j = Math.floor(rng() * (this.hubs.length - 1)); if (j >= i) j++;
        a = jit(this.hubs[i]); b = jit(this.hubs[j]);
      } else if (u < 0.75 && this.gates.length) {
        a = jit(this.center); b = this.gates[Math.floor(rng() * this.gates.length)];
      } else if (H.length) {
        a = H[Math.floor(rng() * H.length)];
        const near = H.filter(h => { const d = dist(h, a) * m; return d > 30 && d < 300; });
        b = near.length ? near[Math.floor(rng() * near.length)] : this.center;
      } else return null;
      return rng() < 0.5 ? [a, b] : [b, a];
    },

    // Well-used trails in this section, inside the growth front, become planned main streets.
    trailsToPlans() {
      const f = this.walk, front = this.frontRadius(), m = CFG.M_PER_PX;
      const mask = f.trailMask(p => this.inSection(p) && dist(p, this.origin) <= front + f.cell);
      const lines = skeletonLines(mask, f.n);
      for (const cells of lines) {
        let pts = cells.map(([i, j]) => f.center(i, j));
        if (pts.length < 2) continue;
        pts = simplify(pts, Math.max(12 / m, 1.2 * f.cell));            // straight pieces only
        const len = polylineLength(pts);
        const freeEnd = p => this.nearestStreet(p, 2 * f.cell) >= 2 * f.cell;
        if (len < 30 / m && (freeEnd(pts[0]) || freeEnd(pts[pts.length - 1]))) continue;   // a spur
        // A trail that stops just short of a street is carried on to it.
        for (const end of [0, pts.length - 1]) {
          const q = this.nearestStreetPoint(pts[end], 2.5 * f.cell);
          if (q && q.d > 0.5) pts[end] = q.point;
        }
        this.addPlan(pts, 'trail');
      }
    },

    // A wall at the current growth edge (walker.py build_wall): a ring road of straight sides.
    buildWall() {
      const m = CFG.M_PER_PX, rng = this.rng, R = this.frontRadius() + 10 / m, n = WALK.wallSides;
      const angs = Array.from({ length: n }, () => rng() * 2 * Math.PI).sort((p, q) => p - q);
      const pts = angs.map(a => { const r = R * rng.range(0.9, 1.1); return { x: this.center.x + r * Math.cos(a), y: this.center.y + r * Math.sin(a) }; });
      pts.push(pts[0]);
      const w = this.walls.length;
      this.walls.push({ R, nodes: [] });
      // Leave out any side that would touch the river.
      let run = [pts[0]];
      const flush = () => { if (run.length > 1) this.addPlan(run, 'wall').wall = w; };
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        const wet = [0.25, 0.5, 0.75, 1].some(f => this.nearRiver({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, this.riverBuffer));
        if (wet) { flush(); run = [b]; }
        else run.push(b);
      }
      flush();
    },

    // New houses near the trails (walker.py settle): favour the growth front and villages;
    // outside the newest wall, cluster near its gates.
    settle(count) {
      const f = this.walk, m = CFG.M_PER_PX, rng = this.rng, R = this.frontRadius();
      const anchors = [];
      for (let q = 0; q < f.G.length; q++) {
        if (f.G[q] <= f.thr || f.blocked[q]) continue;
        const p = f.center(q % f.n, Math.floor(q / f.n));
        const d = dist(p, this.origin);
        if (d < R && this.inSection(p)) anchors.push({ p, d });
      }
      // …and along the streets already built in or next to this section.
      const B = this.box;
      for (const id of this.hash.query(B.x - B.r, B.y - B.r, B.x + B.r, B.y + B.r)) {
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        for (let k = 0; k <= 1; k += 0.25) {
          const p = { x: e.pts[0].x + (e.pts[1].x - e.pts[0].x) * k, y: e.pts[0].y + (e.pts[1].y - e.pts[0].y) * k };
          const d = dist(p, this.origin);
          if (d < R && (this.inSection(p) || this.nearSection(p, 25 / CFG.M_PER_PX * 4))) anchors.push({ p, d });
        }
      }
      if (!anchors.length) return 0;
      const wall = this.walls[this.walls.length - 1];
      const wallGates = wall ? this.wallGates(wall) : [];
      const w = anchors.map(({ p, d }) => {
        let v = Math.exp((d - R) / (120 / m));
        for (const h of this.villagePts) v *= 1 + 2 * Math.exp(-dist(p, h) / (80 / m));   // villages only
        if (wall && dist(p, this.center) > wall.R && wallGates.length) v *= Math.exp(-Math.min(...wallGates.map(g => dist(g, p))) / (90 / m));
        return v;
      });
      let made = 0;
      for (let k = 0; k < count && anchors.length; k++) {
        let total = 0; for (const v of w) total += v;
        let r = rng() * total, i = 0;
        for (; i < w.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
        const a = anchors[i].p; anchors.splice(i, 1); w.splice(i, 1);
        const ang = rng() * 2 * Math.PI, dd = rng.range(20, 110) / m;
        const p = { x: a.x + dd * Math.cos(ang), y: a.y + dd * Math.sin(ang) };
        if (dist(p, this.center) < 45 / m || !this.inSection(p) || this.nearRiver(p, this.riverBuffer) || this.resisted(p)) continue;
        const h = { x: p.x, y: p.y, sid: this.sid, done: false };
        this.houses.push(h); this.houseQueue.push(h); made++;
      }
      return made;
    },
    nearSection(p, r) {
      for (const poly of this.section.poly) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        if (distToSeg(p, { x: poly[j][0], y: poly[j][1] }, { x: poly[i][0], y: poly[i][1] }) < r) return true;
      return false;
    },
    wallGates(wall) {
      const out = [];
      for (const id of wall.nodes) { const n = this.nodes.get(id); if (n && n.edges.size >= 3) out.push(n); }
      return out;
    },

    // ── Planned streets: grow straight from point to point, making a junction wherever they
    //    cross a street, and carrying on to the next point. ──
    addPlan(pts, kind) {
      const plan = { id: this.plans.length, pts: pts.map(p => ({ x: p.x, y: p.y })), kind, i: 0 };
      this.plans.push(plan); this.planQueue.push(plan.id);
      return plan;
    },
    runPlans() {
      // Walls and main roads go first and don't wait for the street budget (they have their own
      // slots); other plans (trails, lanes) take turns as the budget allows.
      const growing = this.growing.filter(b => b.planned !== undefined);
      const isFree = p => p.kind === 'wall' || p.kind === 'thoroughfare';
      let freeActive = growing.filter(b => isFree(this.plans[b.planned])).length;
      let paidActive = growing.length - freeActive;
      const keep = [];
      // cut streets wait until the hour's main roads are drawn, so they can end on them
      const mainsBusy = growing.some(b => this.plans[b.planned].kind === 'thoroughfare') || this.planQueue.some(id => this.plans[id].kind === 'thoroughfare');
      for (const id of this.planQueue) {
        const plan = this.plans[id];
        if (plan.kind === 'cut' && mainsBusy) { keep.push(id); continue; }
        if (plan.after !== undefined && !this.plans[plan.after].done && this.progress() < 0.9) { keep.push(id); continue; }
        if (isFree(plan)) {
          if (freeActive < 4 && this.startPlanSegment(plan, null)) freeActive++;
          else if (freeActive >= 4) keep.push(id);
          continue;
        }
        const cost = polylineLength(plan.pts);
        if (paidActive < (plan.kind === 'cut' ? 6 : 3) && this.budget > 0) {
          this.budget -= cost;
          if (this.startPlanSegment(plan, null)) paidActive++;
        } else keep.push(id);
      }
      this.planQueue = keep;
    },
    startPlanSegment(plan, fromNode) {
      while (plan.i < plan.pts.length - 1) {
        const a = plan.pts[plan.i], b = plan.pts[plan.i + 1];
        if (dist(a, b) < 1) { plan.i++; continue; }
        const node = fromNode || this.nodeAt(a);
        const h = angleOf(node, b), len = dist(node, b);
        if (len < 1) { plan.i++; fromNode = node; continue; }
        this.startBranch(node, h, len, new Set(node.edges), { planned: plan.id, to: { x: b.x, y: b.y }, speed: 15 });
        return true;
      }
      this.planDone(plan, fromNode);
      return false;
    },
    planDone(plan, lastNode) {
      plan.done = true;
      if (plan.kind === 'lane' && lastNode && lastNode.edges.size === 1 && !lastNode.gate && !lastNode.bank) this.laneEnds.add(lastNode.id);
    },

    // A planned street grows straight to its target. Where it crosses a street it makes a
    // junction and carries on; when it arrives it starts the plan's next piece.
    stepPlanned(b, s) {
      const plan = this.plans[b.planned], tip = b.pts[b.pts.length - 1];
      const next = { x: tip.x + Math.cos(b.heading) * s, y: tip.y + Math.sin(b.heading) * s };
      // Give way to an older street still growing across our path (it isn't a street yet).
      for (const o of this.growing) {
        if (o === b || o.done || o.seq > b.seq || o.start === b.start) continue;
        if (segHit(tip, next, o.pts[0], o.pts[o.pts.length - 1])) return;
      }
      const hit = this.castRay(tip, b.heading, s, b.grown < 1.5 ? b.ignore : new Set());
      const left = b.len - b.grown;
      if (hit && hit.d < left - 0.5) {
        const end = this.splitEdge(hit.edge, hit.seg, hit.point);
        this.noteWallNode(plan, end);
        if (end === b.start) { b.pts.push(next); b.grown += s; return; }
        this.finish(b, end, 'planned');
        const rest = dist(end, b.to);
        if (rest > 1) this.startBranch(end, angleOf(end, b.to), rest, new Set(end.edges), { planned: b.planned, to: b.to, speed: b.speed });
        else { plan.i++; this.startPlanSegment(plan, end); }
        return;
      }
      b.pts.push(next); b.grown += s;
      if (b.grown >= b.len) {
        let end = this.nodeAt(b.to);
        if (end === b.start) { b.done = true; plan.i++; this.startPlanSegment(plan, end); return; }
        this.noteWallNode(plan, b.start); this.noteWallNode(plan, end);
        this.finish(b, end, 'planned');
        this.markEdgeEnd(end); this.markEdgeEnd(b.start);
        plan.i++;
        this.startPlanSegment(plan, end);
      }
    },
    // A street end on the section's edge is a gate the next section can carry on from; one at
    // the water is a river end.
    markEdgeEnd(n) {
      if (!n || !this.section || n.edges.size !== 1 || n.gate || n.bank) return;
      if (this.nearRiver(n, this.riverBuffer + 3)) { n.bank = true; n.riverside = this.rng() < CFG.RIVERSIDE_SHARE; return; }
      let d = Infinity;
      for (const poly of this.section.poly) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        d = Math.min(d, distToSeg(n, { x: poly[j][0], y: poly[j][1] }, { x: poly[i][0], y: poly[i][1] }));
      if (d < 4) n.gate = true;
    },
    noteWallNode(plan, n) {
      if (plan.wall === undefined || !n) return;
      const w = this.walls[plan.wall];
      if (w && !w.nodes.includes(n.id)) w.nodes.push(n.id);
    },

    // A node at p: an existing one close by, or a point on a nearby street, or a new one.
    nodeAt(p) {
      for (const n of this.nodesNear(p, CFG.SNAP_R)) if (dist(n, p) < CFG.SNAP_R) return n;
      // a street still growing from here has a node that no finished street shows yet
      for (const g of this.growing) if (!g.done && this.nodes.has(g.start.id) && dist(g.start, p) < 1) return g.start;
      const q = this.nearestStreetPoint(p, 1.5);
      if (q) return this.splitEdge(q.edge, q.seg, q.point);
      return this.addNode(p.x, p.y);
    },
    nearestStreet(p, maxR, ignore = new Set()) {
      const q = this.nearestStreetPoint(p, maxR, ignore);
      return q ? q.d : Infinity;
    },
    nearestStreetPoint(p, maxR, ignore = new Set()) {
      let best = null;
      for (const id of this.hash.query(p.x - maxR, p.y - maxR, p.x + maxR, p.y + maxR)) {
        if (ignore.has(id)) continue;
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        for (let i = 1; i < e.pts.length; i++) {
          const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
          const q = { x: a.x + t * dx, y: a.y + t * dy }, d = dist(q, p);
          if (d <= maxR && (!best || d < best.d)) best = { edge: e, seg: i - 1, point: q, d };
        }
      }
      return best;
    },
    // Every crossing along a ray, nearest first.
    castRayAll(p, ang, len, ignore = new Set()) {
      const q = { x: p.x + Math.cos(ang) * len, y: p.y + Math.sin(ang) * len }, out = [];
      for (const id of this.hash.query(p.x, p.y, q.x, q.y)) {
        if (ignore.has(id)) continue;
        const e = this.edges.get(id); if (!e || !this.isActive(e)) continue;
        for (let i = 1; i < e.pts.length; i++) {
          const h = segHit(p, q, e.pts[i - 1], e.pts[i]);
          if (h && h.t * len > 0.01) out.push({ d: h.t * len, edge: e, seg: i - 1, point: { x: p.x + (q.x - p.x) * h.t, y: p.y + (q.y - p.y) * h.t } });
        }
      }
      return out.sort((a, b) => a.d - b.d);
    },

    // ── The river (river3.py) ──
    // Water lanes: where people live along the bank, short lanes run from the water's edge
    // straight inland to the first street (stairs, landings). Ending at the water is legitimate.
    waterLanes() {
      if (!this.touchesRiver || !this.section) return;
      if ((this.gridStrength || 0) >= 0.5) return;     // in gridded hours the grid meets the river instead
      const m = CFG.M_PER_PX, sp = WATER.spacingM / m, reach = WATER.reachM / m, built = WATER.builtM / m;
      const gap = WATER.minGapM / m, R = this.river, off = this.riverBuffer + 0.5;
      this.waterLaneLines = this.waterLaneLines || [];
      let t = this.rng() * sp;
      for (let i = 0; i < R.length; i++) {
        const p = { x: R[i][0], y: R[i][1] }, q = { x: R[(i + 1) % R.length][0], y: R[(i + 1) % R.length][1] };
        const L = dist(p, q); if (!L) continue;
        for (; t < L; t += sp) {
          const a = { x: p.x + (q.x - p.x) * t / L, y: p.y + (q.y - p.y) * t / L };
          // the bank's direction over a longer stretch (the outline's pieces are short)
          const u = { x: R[(i - 3 + R.length) % R.length][0], y: R[(i - 3 + R.length) % R.length][1] };
          const v = { x: R[(i + 4) % R.length][0], y: R[(i + 4) % R.length][1] };
          const Lt = dist(u, v) || 1;
          let nx = -(v.y - u.y) / Lt, ny = (v.x - u.x) / Lt;
          if (this.inRiver({ x: a.x + nx * 2, y: a.y + ny * 2 })) { nx = -nx; ny = -ny; }   // point inland
          const b = { x: a.x + nx * off, y: a.y + ny * off };
          if (!this.inSection(b) || this.inRiver(b)) continue;
          if (this.bridgeAt && distToSeg(b, this.bridgeAt.near, this.bridgeAt.far) < WATER.bridgeClearM / m + off) continue;
          const lived = this.walk && this.isOrganic() ? this.houses.some(h => dist(h, b) < built) : this.nearestStreet(b, built) < built;
          if (!lived) continue;
          // spaced along the bank, and not where a street already reaches the water
          if (this.waterLaneLines.some(([u2]) => dist(u2, b) < 0.8 * sp)) continue;
          if (this.nodesNear(b, sp / 2).some(nd => nd.bank)) continue;
          const h = Math.atan2(ny, nx);
          const hit = this.castRayAll(b, h, reach).find(x => x.d > 8 / m);
          if (!hit) continue;
          const sa = angleOf(hit.edge.pts[hit.seg], hit.edge.pts[hit.seg + 1]);
          if (Math.abs(Math.sin(sa - h)) < Math.sin(CFG.MIN_ANGLE * DEG)) continue;   // meet the street squarely
          if ([0.3, 0.6, 0.9].some(f => this.inRiver({ x: b.x + nx * hit.d * f, y: b.y + ny * hit.d * f }))) continue;
          if (this.waterLaneLines.some(([u, v]) => Math.min(distToSeg(b, u, v), distToSeg(hit.point, u, v), distToSeg(u, b, hit.point)) < gap)) continue;
          this.waterLaneLines.push([b, hit.point]);
          this.addPlan([b, hit.point], 'lane');
        }
        t -= L;
      }
    },
    // A late embankment (river3c): along each built-up stretch of bank, a street at the water's
    // edge joining the street ends that reached the river, following the bank where it bends.
    buildEmbankment() {
      const R = this.river, n = R.length, cum = [0];
      for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist({ x: R[i - 1][0], y: R[i - 1][1] }, { x: R[i % n][0], y: R[i % n][1] }));
      const where = p => {                                  // nearest river edge and position along the outline
        let best = null;
        for (let i = 0; i < n; i++) {
          const a = { x: R[i][0], y: R[i][1] }, b = { x: R[(i + 1) % n][0], y: R[(i + 1) % n][1] };
          const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
          const d = dist(p, { x: a.x + t * dx, y: a.y + t * dy });
          if (!best || d < best.d) best = { i, s: cum[i] + t * Math.sqrt(L2), d };
        }
        return best;
      };
      const ends = [...this.nodes.values()].filter(nd => nd.bank && nd.edges.size >= 1)
        .map(nd => ({ nd, w: where(nd), side: this.walk ? this.walk.sideOf(nd) : 1 }))
        .sort((a, b) => a.w.s - b.w.s);
      const onLand = (i, sgn) => {                          // river vertex i, stepped onto land
        const a = { x: R[(i - 1 + n) % n][0], y: R[(i - 1 + n) % n][1] }, b = { x: R[(i + 1) % n][0], y: R[(i + 1) % n][1] };
        const L = dist(a, b) || 1; let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
        const v = { x: R[i][0], y: R[i][1] };
        if (this.inRiver({ x: v.x + nx * 2, y: v.y + ny * 2 })) { nx = -nx; ny = -ny; }
        return { x: v.x + nx * this.riverBuffer, y: v.y + ny * this.riverBuffer };
      };
      for (let k = 1; k < ends.length; k++) {
        const A = ends[k - 1], B = ends[k];
        if (A.side !== B.side || B.w.s - A.w.s > 70 || dist(A.nd, B.nd) > 60) continue;    // not one built stretch
        if (this.bridgeAt && [A.nd, B.nd].some(p => distToSeg(p, this.bridgeAt.near, this.bridgeAt.far) < 8)) continue;
        const pts = [{ x: A.nd.x, y: A.nd.y }];
        for (let i = A.w.i + 1; i <= B.w.i; i++) pts.push(onLand(i));   // follow the bank where it bends
        pts.push({ x: B.nd.x, y: B.nd.y });
        const clean = [pts[0]];
        for (const p of pts.slice(1)) if (dist(p, clean[clean.length - 1]) > 2) clean.push(p);
        const wet = clean.some((p, j) => j > 0 && [0.25, 0.5, 0.75].some(f => this.inRiver({ x: clean[j - 1].x + (p.x - clean[j - 1].x) * f, y: clean[j - 1].y + (p.y - clean[j - 1].y) * f })));
        if (!wet && clean.length > 1) this.addPlan(clean, 'wall');
      }
    },
    // ── Lanes (walker.py grow_lanes): a house far from any street gets a straight lane from
    //    the nearest street, near-square to it, that stops at the first street it meets. ──
    tryLane(house) {
      if (!house || house.done) return;
      const m = CFG.M_PER_PX, rng = this.rng;
      const near = this.nearestStreetPoint(house, LANE.maxReachM / m);
      if (!near) { if (!house.retried) { house.retried = true; this.houseQueue.push(house); } return; }
      house.done = true;
      if (near.d <= LANE.accessM / m) return;                          // already served
      const e = near.edge, a = e.pts[near.seg], b = e.pts[near.seg + 1];
      const along = angleOf(a, b);
      let nrm = along + Math.PI / 2;
      if (Math.cos(nrm) * (house.x - near.point.x) + Math.sin(nrm) * (house.y - near.point.y) < 0) nrm += Math.PI;
      let h = nrm + rng.gauss() * LANE.jitter * DEG;
      const reach = Math.cos(h) * (house.x - near.point.x) + Math.sin(h) * (house.y - near.point.y);
      const sig = Math.sqrt(Math.log(1 + LANE.cv ** 2));
      const Lx = Math.max(Math.exp(Math.log(LANE.medianM / m) + sig * rng.gauss()), reach + 10 / m);
      const probe = rng() < LANE.pConnect ? LANE.maxReachM / m : Lx;
      const hits = this.castRayAll(near.point, h, probe, new Set([e.id])).filter(x => x.d > 5 / m);
      let cut, end;
      if (hits.length) {
        cut = hits[0].d;
        if (rng() < LANE.pCross && hits.length > 1) cut = hits[1].d;   // on across the first street
        end = { x: near.point.x + Math.cos(h) * cut, y: near.point.y + Math.sin(h) * cut };
      } else {
        cut = Math.min(Lx, probe);
        end = { x: near.point.x + Math.cos(h) * cut, y: near.point.y + Math.sin(h) * cut };
        const s = this.nearestStreetPoint(end, LANE.snapM / m, new Set([e.id]));
        if (s) { end = s.point; h = angleOf(near.point, end); cut = dist(near.point, end); }
      }
      // Never beyond the growth front, the section, or into the river.
      // (A lane may start on an earlier section's street: it only has to stay inside once it's in.)
      const front = this.frontRadius();
      let entered = false;
      for (let d = 1; d <= cut; d += 1) {
        const p = { x: near.point.x + Math.cos(h) * d, y: near.point.y + Math.sin(h) * d };
        const inside = this.inSection(p);
        if (!entered) { if (inside) entered = true; else if (d > 12) return; else continue; }
        if (dist(p, this.origin) > front || !inside || this.nearRiver(p, this.riverBuffer)) {
          cut = d - 1; end = { x: near.point.x + Math.cos(h) * cut, y: near.point.y + Math.sin(h) * cut }; break;
        }
      }
      if (!entered) return;
      if (cut < LANE.minLenM / m) return;
      if (this.resisted(end) || this.resisted(house)) return;
      // Reject a lane that runs alongside an existing street for more than half its length.
      const gap = LANE.minGapM / m; let hug = 0, n = 0;
      for (let d = 2; d < cut - 2; d += 1.5) {
        const p = { x: near.point.x + Math.cos(h) * d, y: near.point.y + Math.sin(h) * d };
        n++; if (this.nearestParallel(p, h, gap, new Set([e.id])) < gap) hug++;
      }
      if (n && hug / n > 0.5) return;
      this.addPlan([near.point, end], 'lane');
    },
    // End of a stage: lanes that still end in nothing carry straight on to the next street, or
    // link to a street close by.
    connectLanes() {
      const m = CFG.M_PER_PX;
      for (const id of [...this.laneEnds]) {
        const n = this.nodes.get(id);
        if (!n || n.edges.size !== 1) { this.laneEnds.delete(id); continue; }
        if (this.rng() > LANE.pConnect) continue;
        const e = this.edges.get([...n.edges][0]); if (!e) continue;
        const h = this.dirAt(n, e) + Math.PI;
        const start = { x: n.x + Math.cos(h), y: n.y + Math.sin(h) };
        const hit = this.castRay(start, h, LANE.maxReachM / m, new Set([e.id]));
        let target = null;
        if (hit && this.inSection(hit.point) && !this.nearRiver(hit.point, this.riverBuffer)) target = hit.point;
        else {
          const other = this.nodes.get(e.a === n.id ? e.b : e.a);
          const q = this.nearestStreetPoint(n, LANE.linkM / m, new Set([e.id]));
          if (q && q.d > 5 / m && dist(q.point, other) > 1) target = q.point;
        }
        if (target) { this.addPlan([n, target], 'lane'); this.laneEnds.delete(id); }
      }
    },
  });

  const api = { CitySim, CFG, WALK, LANE, characterAt, countCorners, signedArea, skeletonLines, simplify };
  if (typeof module !== 'undefined') module.exports = api;
  else Object.assign(globalThis, { CitySim, CFG });
})();
