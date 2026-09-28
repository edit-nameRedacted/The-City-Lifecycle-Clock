// sim.js — the city-growth simulation for the whole morning: twelve hours, thirteen sections.
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
    GROW_TIME: 3,         // s for a new street to reach full length
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
    FACE_SHARE: 0.6,      // street spacing: enclosed areas this share of a block (neighbours merge)
    P_TIP: 0.3,           // chance a spawn extends a dead end (falls to 0 in new areas)
    P_ENTRY: 0.3,         // chance a spawn carries a street on across from an earlier section
    P_RIVERSIDE: 0.2,     // chance a spawn tries to link two streets along the river bank
    RIVERSIDE_SHARE: 0.5, // share of streets reaching the bank that may join a riverside street
    CUL_DE_SAC: 1,        // × (dead-end target above the old core's): chance a spawn is a cul-de-sac
    MAX_REACH: 6,         // × segment length: how far a new street looks for a street to join
    MAX_PRUNE: 1,         // most streets faded per minute
    PRUNE_EPS: 0.2,       // how much a street must be hurting the character before it's faded
    WINDOW_R: 250 / 4.5,  // px (250 m): the local window for measuring character
    WIDTH0: 0.9, WIDTH_MAX: 2.2, WIDTH_BLOCK: 0.15, WIDTH_USE: 0.02, WIDTH_ROAD: 0.35,
    THICKEN_FROM: 0.3,    // streets only start widening once the character t reaches this
    GRID_FROM: 0.2,       // from this character t on, new streets are pulled onto a grid…
    GRID_FULL: 0.55,      // …fully by this one. The grid's direction comes from the streets
                          // already built, so a grid that forms in the middle rings carries on
    DUSK_LENGTH: 7200,    // s after the last section: the city keeps tidying itself at dusk
    DUSK_EXTEND_EVERY: 15,// s between streets pushed out past the city's edge at dusk
    DUSK_FILL_EVERY: 20,  // s between leftover areas filled in at dusk
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

      this.nodes = new Map(); this.edges = new Map(); this.nextId = 1;
      this.hash = new SpatialHash(12);
      this.bySection = new Map();   // section id → Set of edge ids grown in it
      this.fading = new Set();
      this.growing = [];            // streets still extending
      this.blocks = [];             // filled blocks, all sections
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
      this.blockTarget = (S.landArea * CFG.COVER) / st.minutes;   // each minute's share of the land
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
      this.minBlock = 0.4 * this.blockArea;
      this.maxBlock = 2.5 * this.blockArea;
      this.junctionGap = CFG.JUNCTION_GAP * Math.sqrt(this.blockArea);
      this.maxReach = CFG.MAX_REACH * this.segLenPx;
      this.thicken = st.t >= CFG.THICKEN_FROM;
      this.cornerTol = lerp(CFG.CORNER_TOL[0], CFG.CORNER_TOL[1], st.t);
      this.rectTol = lerp(CFG.RECT_TOL[0], CFG.RECT_TOL[1], st.t);
      this.pTip = CFG.P_TIP * (1 - st.t);
      this.pCul = Math.max(0, this.T.deadEnd - OLD.deadEnd) * CFG.CUL_DE_SAC;
      this.filled = 0; this.debt = 0;
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
      const gRaw = Math.min(1, Math.max(0, (st.t - CFG.GRID_FROM) / (CFG.GRID_FULL - CFG.GRID_FROM)));
      this.gridStrength = gRaw * gRaw * (3 - 2 * gRaw);
      if (this.gridStrength > 0) {
        const a = this.grainAround(S);
        if (a !== null) this.gridAngle = a;
        if (this.gridAngle === undefined) this.gridStrength = 0;
      }
      (this.gridLog = this.gridLog || {})[this.sid] = this.gridStrength;

      // Streets that ended at this section's edge in earlier hours: they can carry on into it.
      this.entries = [...this.nodes.values()].filter(n => n.gate && n.edges.size === 1 && this.entersSection(n));
      if (!this.quiet && k > 0 && st.t >= CFG.ORGANIC_UNTIL && this.sid !== this.firstFar && this.entries.length < 3) this.walkIn();

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
      for (let k = 0; k < this.stage; k++) {
        for (const poly of this.sections[this.schedule[k].id].poly) if (pointInPoly(p, poly)) return true;
      }
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
        if (S.poly.some(pl => pointInPoly(m, pl))) continue;
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
    inSection(p) {
      for (const poly of this.section.poly) if (pointInPoly(p, poly)) return true;
      return false;
    }
    inRiver(p) { return pointInPoly(p, this.river); }
    nearRiver(p, d) {
      if (this.inRiver(p)) return true;
      const R = this.river;
      for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
        if (distToSeg(p, { x: R[j][0], y: R[j][1] }, { x: R[i][0], y: R[i][1] }) < d) return true;
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
          if (!best || d < best.d) best = { e, seg: i - 1, P, d };
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
      const h = angleOf(this.bridgeAt.near, this.bridgeAt.far);
      const dirs = [h + this.rng.gauss() * 8 * DEG, h - (55 + 15 * this.rng()) * DEG, h + (55 + 15 * this.rng()) * DEG];
      this.seedFrom(this.farNode, dirs.map(d => this.align(d)));
    }

    // ── 4d. Once a second: try to sprout one street ─────────
    tickSecond() {
      if (this.walkerOnly()) return;
      this.cache = null;                        // lists rebuilt at most once a second
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
      if (s && !s.riverside) s.heading = this.align(s.heading);
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
      return this.frontFrom + (this.extent - this.frontFrom) * (CFG.FRONT_START + (1 - CFG.FRONT_START) * Math.sqrt(p));
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
      if (pts.length < 2 || polylineLength(pts) < CFG.MIN_SEG * 0.6) return null;
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
      // Where the growing tip actually was. If snapping to the node moved the end, the
      // renderer uses this to widen the street over the gap instead of letting it jump.
      const tip = b.pts[b.pts.length - 1];
      if (dist(tip, end) > 0.3) e.snap = { from: { x: tip.x, y: tip.y }, t: this.time };
      if (b.planned !== undefined) { e.main = this.plans[b.planned].kind !== 'lane'; return e; }
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
      for (let k = 0; k < 6 && this.filled < m; k++) {
        const behind = m - this.filled;
        const anyShape = behind > 2 || m > st.minutes - 10;
        if (!this.fillBlock(m, anyShape)) break;
        got = true;
      }
      if (!got) {
        if (this.thicken) this.widenMainRoad();
        this.prune(this.box, this.box.r);          // tidy the whole section
      }
      const next = this.schedule[this.stage + 1];
      if (next && next.id === this.firstFar && m === st.minutes - 1) this.buildBridge();
    }
    fillBlock(minute, sweep = false) {
      const { faces } = this.findFaces(this.box);
      const progress = minute / this.st.minutes, cands = [];
      // Late in the hour, less fussy. The walker core's blocks are irregular from the start.
      const relax = sweep || progress > CFG.RELAX_AFTER || this.walkerOnly();
      for (const f of faces) {
        // In the last-minute sweep, big leftover areas count too: estates, yards, parks.
        if (f.area < this.minBlock || f.area > (sweep ? 2.5 : 1) * this.maxBlock) continue;
        // Its middle must be in this section — or, for an area closed off by this section's
        // streets along the border, in a section that's already finished.
        if (!this.inSection(f.c)) {
          let ownsEdge = false;
          for (const id of f.edgeIds) if (this.edges.get(id).sid === this.sid) { ownsEdge = true; break; }
          if (!ownsEdge || !this.inFinishedSection(f.c)) continue;
        }
        f.key = [...f.edgeIds].sort((a, b) => a - b).join(',');
        if (this.filledKeys.has(f.key)) continue;                  // this exact face is already a block
        const hosts = this.blocks.filter(bl => pointInPoly(f.c, bl.ring));
        if (hosts.some(bl => f.area / bl.area > 0.85)) continue;  // already filled
        const host = hosts.length > 0;
        const turns = cornerTurns(f.pts, this.cornerTol);
        if (relax) {
          // Late in the hour, any tidy-enough shape; in the final sweep, any shape at all
          // (stepped, L-shaped areas are common where grids meet).
          if (turns.length < 3 || (!sweep && turns.length > 6)) continue;
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
      this.blocks.push(block); this.filled++; this.filledKeys.add(f.key);
      // Take in neighbouring empty areas until the block holds its share of the section.
      const byEdge = new Map();
      for (const g of faces) for (const id of g.edgeIds) { if (!byEdge.has(id)) byEdge.set(id, []); byEdge.get(id).push(g); }
      const queue = [f], seen = new Set([f]);
      while (queue.length && block.area < 0.9 * this.blockTarget) {
        const cur = queue.shift();
        for (const id of cur.edgeIds) for (const g of byEdge.get(id) || []) {
          if (seen.has(g)) continue; seen.add(g);
          g.key = g.key || [...g.edgeIds].sort((a, b) => a - b).join(',');
          if (this.filledKeys.has(g.key) || g.area > this.blockTarget || !this.inSection(g.c)) continue;
          if (this.blocks.some(bl => pointInPoly(g.c, bl.ring))) continue;
          if (block.area + g.area > 1.3 * this.blockTarget) continue;
          block.extra.push(g.pts.map(p => ({ x: p.x, y: p.y }))); block.area += g.area;
          this.filledKeys.add(g.key); queue.push(g);
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
    // Follow a street through junctions where it carries on nearly straight: a "road".
    roadThrough(e0) {
      const road = [e0], used = new Set([e0.id]);
      for (const startId of [e0.a, e0.b]) {
        let n = this.nodes.get(startId), e = e0;
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
          road.push(next); used.add(next.id); e = next;
          n = this.nodes.get(next.a === n.id ? next.b : next.a);
        }
      }
      return road;
    }
    // A minute with no block to fill: the straightest long road in the section gets wider.
    widenMainRoad() {
      const edges = this.sectionEdges(); if (!edges.length) return;
      let best = null;
      for (let k = 0; k < 30; k++) {
        const road = this.roadThrough(edges[Math.floor(this.rng() * edges.length)]);
        if (road.every(e => e.width >= CFG.WIDTH_MAX)) continue;
        const L = road.reduce((s, e) => s + e.len, 0);
        if (!best || L > best.L) best = { road, L };
      }
      if (!best) return;
      for (const e of best.road) e.width = Math.min(CFG.WIDTH_MAX, e.width + CFG.WIDTH_ROAD);
      this.events.push({ type: 'road', ids: best.road.map(e => e.id), t: this.time });
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
      let cands = inWin.filter(e => e.state === 'PROVISIONAL' && !e.frozen && !e.main && e.sid === this.sid);
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
        if (this.isOrganic()) this.organicTick(inSec);
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
      for (const id in this.sections) for (const poly of this.sections[id].poly) if (pointInPoly(p, poly)) return true;
      return false;
    }
    outsideCity(p) {
      return p.x > 4 && p.y > 4 && p.x < this.mapW - 4 && p.y < this.mapH - 4 && !this.inAnySection(p) && !this.inRiver(p);
    }
    tickDusk(d) {
      if (d % CFG.DUSK_EXTEND_EVERY === 0) this.extendOutward();
      if (d % CFG.DUSK_FILL_EVERY === 0) this.fillLeftover(d);
    }
    // Carry a street on past the city's edge, or branch off one that already has been.
    extendOutward() {
      const ahead = (n, h, k) => ({ x: n.x + Math.cos(h) * k, y: n.y + Math.sin(h) * k });
      if (this.rng() < 0.65) {
        const ends = [];
        for (const n of this.nodes.values()) {
          if (n.edges.size !== 1 || !(n.gate || n.outskirt) || (n.outskirt || 0) >= 3) continue;
          const e = this.edges.get([...n.edges][0]); if (!e || !this.isActive(e)) continue;
          const h = this.dirAt(n, e) + Math.PI;
          if (this.outsideCity(ahead(n, h, 4))) ends.push({ n, h });
        }
        if (!ends.length) return;
        const x = ends[Math.floor(this.rng() * ends.length)];
        const h = this.align(x.h + this.rng.gauss() * 4 * DEG);
        this.startBranch(x.n, h, this.segLenPx * this.rng.range(0.4, 1.6), new Set(x.n.edges), { free: true, depth: (x.n.outskirt || 0) + 1 });
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
        this.duskFaces = this.findFaces().faces.filter(f => f.area >= 150 && f.area <= 25000 && this.inAnySection(f.c))
          .sort((p, q) => dist(p.c, this.center) - dist(q.c, this.center));
      }
      while (this.duskFaces.length) {
        const f = this.duskFaces.shift();
        f.key = [...f.edgeIds].sort((a, b) => a - b).join(',');
        if (this.filledKeys.has(f.key)) continue;
        if (![...f.edgeIds].every(id => this.edges.has(id))) continue;       // changed since
        if (this.blocks.some(bl => pointInPoly(f.c, bl.ring))) continue;      // already shaded
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
        edges: [...this.edges.values()].map(e => ({ id: e.id, a: e.a, b: e.b, pts: e.pts, state: e.state, alpha: e.alpha,
          width: e.width, born: e.born, sid: e.sid, frozen: !!e.frozen, bridge: !!e.bridge, main: !!e.main })),
        fading: [...this.fading],
        bySection: [...this.bySection].map(([k, v]) => [k, [...v]]),
        blocks: this.blocks, filledKeys: [...this.filledKeys],
        entries: this.entries.map(n => n.id),
        growing: this.growing.map(b => Object.assign({}, b, { start: b.start.id, target: b.target ? b.target.id : null, ignore: [...b.ignore] })),
        organic: this.walk ? {
          G: f32ToB64(this.walk.G), walkers: this.walk.walkers,
          houses: this.houses, queue: this.houseQueue.map(h => this.houses.indexOf(h)),
          hubs: this.hubs, gateAngles: this.gateAngles, gates: this.gates, plans: this.plans, planQueue: this.planQueue,
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
      for (const e of d.edges) { sim.edges.set(e.id, e); sim.hash.add(e); e.len = polylineLength(e.pts); if (!e.frozen) delete e.frozen; if (!e.bridge) delete e.bridge; if (!e.main) delete e.main; }
      sim.fading = new Set(d.fading);
      sim.bySection = new Map(d.bySection.map(([k, v]) => [k, new Set(v)]));
      sim.blocks = d.blocks; sim.stats = d.stats; sim.quotaLog = d.quotaLog;
      sim.filledKeys = new Set(d.filledKeys || []);
      sim.enterStageQuietly(d.stage);
      sim.sub = d.sub; sim.nextId = d.nextId; sim.filled = d.filled; sim.debt = d.debt; sim.finished = d.finished;
      if (d.finished) { sim.enterDusk(); sim.duskDone = d.duskDone; }
      sim.rng.setState(d.rng);
      sim.farNode = d.farNode ? sim.nodes.get(d.farNode) : null;
      sim.entries = d.entries.map(id => sim.nodes.get(id)).filter(Boolean);
      sim.growing = d.growing.map(b => Object.assign(b, { start: sim.nodes.get(b.start), target: b.target ? sim.nodes.get(b.target) : undefined, ignore: new Set(b.ignore) }))
        .filter(b => b.start);
      if (d.organic && sim.walk) {
        const o = d.organic;
        sim.walk.G = b64ToF32(o.G); sim.walk.walkers = o.walkers; sim.walk.gx = null;
        sim.houses = o.houses; sim.houseQueue = o.queue.map(i => sim.houses[i]).filter(Boolean);
        sim.hubs = o.hubs; sim.gateAngles = o.gateAngles; sim.gates = o.gates;
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

  // The trail field G on a grid, and the walkers that wear it.
  class TrailField {
    constructor(sim, center, halfPx) {
      const m = CFG.M_PER_PX;
      this.sim = sim; this.cell = WALK.cellM / m;                     // px per cell
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
      for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
        const p = this.center(i, j);
        if (dist(p, sim.center) < WALK.plazaM / m || sim.nearRiver(p, sim.riverBuffer)) this.blocked[j * this.n + i] = 1;
      }
      this.boxR = Math.max(1, Math.round(sigC * 0.9));                 // box blur ≈ the exp(−r/σ) kernel
      this.walkers = [];
    }
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
      const rng = this.sim.rng, arrive = WALK.arriveM / CFG.M_PER_PX, decay = 1 / this.T;
      for (let s = 0; s < steps; s++) {
        // new trips: Poisson(spawn)
        let L = Math.exp(-WALK.spawn), k = 0, p = rng();
        while (p > L) { k++; p *= rng(); }
        for (let q = 0; q < k; q++) { const t = trip(); if (t) this.walkers.push({ x: t[0].x, y: t[0].y, d: t[1] }); }
        if (s % 8 === 0 || !this.gx) {                    // regrowth (eq 1), applied in batches of 8
          const f = Math.pow(1 - decay, s === 0 ? 0 : 8);
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
          }
          const em = Math.hypot(ex, ey) || 1e-9;
          w.x += this.v0 * ex / em; w.y += this.v0 * ey / em;          // eq (4)
          const c2 = this.idx(w);
          if (c2 >= 0 && !this.blocked[c2]) {                            // eq (1), deposit
            this.G[c2] = Math.min(this.gmax, this.G[c2] + this.I * (1 - this.G[c2] / this.gmax));
          }
          if (Math.hypot(w.d.x - w.x, w.d.y - w.y) > arrive && c2 >= 0) keep.push(w);
        }
        this.walkers = keep;
      }
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
          if (!S.poly.some(pl => pointInPoly(p, pl)) || this.nearRiver(p, 20)) continue;
          this.hubs.push(p);
          for (let k = 0; k < 6; k++) addHouse({ x: p.x + rng.gauss() * 30 / m, y: p.y + rng.gauss() * 30 / m }, id);
          break;
        }
      }
      // Gates: five roads out of town, plus the river crossing.
      this.gateAngles = [];
      const a0 = rng() * 2 * Math.PI;
      for (let k = 0; k < WALK.nGates; k++) this.gateAngles.push(a0 + k * 2 * Math.PI / WALK.nGates + rng.gauss() * 0.25);
      this.placeGates(WALK.gateRM / m);
    },
    // Gates at a given distance along the gate roads, moved inward if they'd land in the river
    // or across it.
    placeGates(R) {
      this.gates = [];
      for (const a of this.gateAngles) {
        for (let r = R; r > 40; r -= 5) {
          const p = { x: this.center.x + r * Math.cos(a), y: this.center.y + r * Math.sin(a) };
          if (!this.nearRiver(p, 10) && this.walk.idx(p) >= 0 && this.sameBank(p)) { this.gates.push(p); break; }
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
      if (stage > 0) this.connectLanes();               // end of the last stage: link loose lanes
      const land = this.section.landArea / this.sections[this.schedule[0].id].landArea;
      this.walk.run(Math.round(WALK.stepsPerStage * Math.sqrt(land)), () => this.trip());
      this.trailsToPlans();
      if (this.stage === 0 && WALK.wallsAt.includes(stage + 1)) this.buildWall();
      this.stageHouses = this.settle(Math.round(WALK.housesPerStage * land));
    },

    // A trip (walker.py _trip): house → nearest hub, hub ↔ hub, market ↔ gate, house ↔ house.
    trip() {
      const rng = this.rng, H = this.houses, m = CFG.M_PER_PX, jit = p => ({ x: p.x + rng.gauss() * 8 / m, y: p.y + rng.gauss() * 8 / m });
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
        for (const h of this.hubs.slice(1)) v *= 1 + 2 * Math.exp(-dist(p, h) / (80 / m));
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
        if (dist(p, this.center) < 45 / m || !this.inSection(p) || this.nearRiver(p, this.riverBuffer)) continue;
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
      let active = this.growing.filter(b => b.planned).length;
      while (active < 3 && this.planQueue.length) {
        const plan = this.plans[this.planQueue.shift()];
        if (this.startPlanSegment(plan, null)) active++;
      }
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
      if (!n || n.edges.size !== 1 || n.gate || n.bank) return;
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

  const api = { CitySim, CFG, WALK, LANE, characterAt, countCorners, signedArea };
  if (typeof module !== 'undefined') module.exports = api;
  else Object.assign(globalThis, { CitySim, CFG });
})();
