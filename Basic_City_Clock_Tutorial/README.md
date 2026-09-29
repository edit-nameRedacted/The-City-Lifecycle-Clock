# Building the city clock, part 1: the old core

This tutorial walks through the code for the centre circle, section 1. By the end, the sketch starts zoomed in on the core, syncs to the real clock, sprouts a street every second, fills one block every minute, fades streets that don't fit the old-city character, and zooms out slowly over the hour.

The code comes in four files:

| File | What it holds |
|---|---|
| `index.html` | Loads p5 and the three scripts, in order |
| `geometry.js` | The map geometry we measured: centre, rings, section outlines, river, bridge |
| `sim.js` | The simulation itself. Plain JavaScript, no p5 |
| `sketch.js` | The p5 part: clock, camera, drawing, keyboard |

The base map is `basemap.svg`, a copy of your vector map adjusted to line up with the geometry (see Step 1). The original `basemap.jpg` is in the folder too; set `MAP_FILE` at the top of `sketch.js` to switch. Browsers won't let a page loaded from `file://` read an image, so serve the folder:

```
cd section1
python3 -m http.server
```

Then open `http://localhost:8000`.

The sketch has two modes, set by `MODE` at the top of `sketch.js`:

- **`'clock'`** (the default) shows the real time. The city is seeded from today's date, so every refresh today rebuilds the same city, and tomorrow's is different.
- **`'demo'`** starts a brand-new city on every refresh, growing from the beginning of hour 0, at `DEMO_SPEED` (60 = one hour of growth per real minute). While it runs, keys 1–4 switch between ×1, ×10, ×60 and ×600, the space bar pauses, and R starts a new city. The seed is shown on screen; set `DEMO_SEED` to it to replay a city you liked.

You can also set these in the address instead of editing the file: `?mode=demo&speed=120&seed=demo-42`.

One change from the geometry file you already have: `CENTER` is now `CITY_CENTER`, because p5 already uses the name `CENTER` for alignment.

---

## Why the simulation is separate from the drawing

`sim.js` knows nothing about p5, screens or cameras. It keeps a street network in map pixels and changes it when told that time has passed. `sketch.js` reads that network each frame and draws it.

That split buys three things. You can run a whole hour of city growth in Node without a browser (that's how the tuning was done). The simulation behaves identically whether it runs live or fast-forwards. And when we build sections 2 onward, only the settings passed into the simulation change, not the drawing code.

---

## Step 1: the map and the camera

Everything is drawn in map pixels, the same coordinates as `geometry.js`. The camera turns map pixels into screen pixels with three transforms:

```js
translate(width / 2, height / 2);   // screen centre becomes the origin
scale(camScale());                  // zoom
translate(-cam.x, -cam.y);          // the map point we're looking at moves to the origin
drawMap();                          // the map, in map pixels
```

Read them bottom to top: move the point of interest to the origin, scale around it, then move the origin to the middle of the screen. After these three lines you can draw a street at `(700, 720)` and it lands in the right place at any zoom.

**Keeping the SVG sharp.** p5's own `loadImage()` turns an SVG into pixels once, at its natural size, so it blurs when you zoom in, just like a JPEG. Worse, an SVG with no `width` and `height` in its header has no natural size, and the browser falls back to a tiny default: your original export loaded at 224 × 150 pixels, which is why it looked so blurry. So `preload()` loads the map as a plain browser image instead, which stays vector.

Rendering 1,000-odd shapes every frame at a slowly changing zoom would be slow, though. `drawMap()` keeps an off-screen copy of just the area on screen, plus a margin, rendered sharply at the current zoom. It re-renders only when the zoom has changed by more than 4% or the view has moved outside the copy. Over an hour of slow zooming, that's about ten re-renders.

**Lining the SVG up.** Your vector map wasn't framed exactly like the original image: its artboard is wider (2575.7 × 1728), and the drawing is offset and about 4% narrower. I found the fit by matching the river banks in both, then baked it into the copy's header (`width`, `height`, `viewBox` and `preserveAspectRatio="none"`), so the SVG now covers exactly the same 2454 × 1728 map pixels. The redrawn river also bends a little differently in its lower stretch, so the river outline, the bridge and the section shapes in `geometry.js` were re-measured from the SVG. Because the redraw starts slightly to the right of the original, there's a thin blank strip about 20 map pixels wide down the far left edge.

The zoom is set by how many map pixels of radius should fit on screen:

```js
function camScale() { return min(width, height) / (2 * cam.r); }
```

`cam.r` starts at 125, just wider than the section's 110 px radius, and eases toward 175 by the end of the hour:

```js
function updateCamera(progress) {
  const p = constrain(progress, 0, 1);
  const eased = p * p * (3 - 2 * p);               // smoothstep: slow start, slow finish
  const targetR = lerp(VIEW_R[0], VIEW_R[1], eased);
  cam.r += (targetR - cam.r) * 0.02;               // chase the target, never jump to it
}
```

The last line matters more than it looks. Each frame the camera moves 2% of the way to its target. If the target ever jumps (say, at the start of a new section) the camera still glides.

**Try it.** Set `VIEW_R = [60, 300]` and run at ×600 to see the whole zoom in a few seconds.

---

## Step 2: the clock

Each frame, the sketch works out how many seconds into the hour the city should have reached:

```js
function targetSeconds() {
  if (MODE === 'demo') return Math.min(demoTime, 3600);
  return (Date.now() - hourStart) / 1000;
}
```

In clock mode that's just the real time since the hour began. In demo mode, `demoTime` is a counter that `draw()` advances by each frame's length times `DEMO_SPEED`:

```js
if (!paused) demoTime += (deltaTime / 1000) * DEMO_SPEED;
```

Because it adds a little each frame rather than multiplying the total, changing speed mid-run never makes the time jump. `deltaTime` is p5's built-in length of the last frame in milliseconds.

The simulation doesn't use the clock directly. It is told "you are now this many seconds into the hour," and catches up in fixed steps of a tenth of a second:

```js
advanceTo(seconds) {
  const target = Math.floor(seconds / CFG.SUB + 1e-9);
  while (this.sub < target) {
    this.sub++;
    this.update(CFG.SUB);                    // streets grow, faded streets fade
    if (this.sub % 10 === 0) {               // a whole second has passed
      const s = this.sub / 10;
      if (s % 60 === 0) this.tickMinute(s / 60);
      else this.tickSecond();
    }
  }
}
```

Fixed steps are what make the city repeatable. The random numbers come from a seeded generator (`makeRng`), seeded with the date in clock mode. A browser at 30 frames per second and one at 120 reach the same state at 12:40, and reloading the page rebuilds the same city. (For now the hour is in the seed too, because only section 1 exists and each hour replays it. Once all the sections are built, the date alone will be the seed.) In demo mode the seed is random, which is the only reason each refresh differs.

Fast-forwarding on load is this same loop. `draw()` calls `advanceTo` a second at a time but stops after 25 ms per frame, so the page stays responsive and you can watch the city catch up. A full 59 minutes takes about four to five seconds.

---

## Step 3: the street network

The city is a graph. A **node** is a junction, a dead end, or a point where a street meets the section edge (a *gate*, which later sections will connect to). An **edge** is the street between two nodes. Every street is a straight line, so `pts` holds just its two end points. It's stored as a list anyway, so the rest of the code doesn't have to change if you ever want bent streets.

```js
{ id, a, b, pts: [{x, y}, ...], state, alpha, width, born }
```

`state` is the street's life story:

| State | Meaning |
|---|---|
| (growing) | Still extending. Kept in `sim.growing`, not yet an edge |
| `PROVISIONAL` | Finished, but can still be faded |
| `CEMENTED` | Borders a filled block. Permanent |
| `FADING` | Rejected. Loses opacity, then is removed |

The one operation everything else depends on is **splitting**. When a new street meets an existing one, the existing edge is cut in two at the meeting point, and a node is placed there:

```js
splitEdge(e, i, P) {
  const A = this.nodes.get(e.a), B = this.nodes.get(e.b);
  if (dist(P, A) < CFG.SNAP_R) return A;       // close enough to an existing node: reuse it
  if (dist(P, B) < CFG.SNAP_R) return B;
  const n = this.addNode(P.x, P.y);
  const p1 = e.pts.slice(0, i + 1).concat([P]);
  const p2 = [P].concat(e.pts.slice(i + 1));
  this.removeEdge(e, true);
  this.addEdge(A, n, p1, e.state, e.width);
  this.addEdge(n, B, p2, e.state, e.width);
  return n;
}
```

`SNAP_R` is 4 px, which is 12 m at 3 m per pixel: the same tolerance the street-geometry study used to merge intersections.

Checking every street for every collision would be slow, so streets are also filed in a **spatial hash**: a grid of 12 px cells, each listing the streets that pass through it. To ask "what's near this point?", look only in the nearby cells.

---

## Step 4: the first footpaths

The city starts as a single node at the centre with three or four footpaths leading out of it. One heads roughly toward where the bridge will land, since that's where people would walk. The others head out at uneven angles:

```js
seedCore() {
  const c = this.addNode(this.center.x, this.center.y);
  const dirs = [];
  if (this.bridgeNear) dirs.push(angleOf(this.center, this.bridgeNear) + this.rng.gauss() * 10 * DEG);
  const n = 2 + Math.floor(this.rng() * 2);
  let base = this.rng() * 2 * Math.PI;
  for (let i = 0; i < n; i++) { base += (2 * Math.PI / (n + 1)) * this.rng.range(0.7, 1.3); dirs.push(base); }
  for (const a of dirs) this.startBranch(c, a, this.rOut * this.rng.range(0.8, 1.3), new Set());
}
```

These footpaths reach the edge of the circle and become the first streets everything else hangs off.

---

## Step 5: one street every second

Every second, `tickSecond()` tries up to ten times to find a legal place to sprout a street.

**Where.** About a third of the time (`P_CROSS`), it picks an existing T-junction and carries the side street straight on across the main street, making a crossroads (`pickCrossing()`). Otherwise it picks a random point on an existing street, in proportion to street length, or now and then extends a dead end.

The city grows outward from the centre. A *growth front* starts at 35% of the circle's radius and spreads to the edge over the hour (`frontRadius()`). Streets inside the front are ten times as likely to sprout as streets outside it, so the core fills in first and the edges last.

In the old core, streets never get wider: all the effort goes into finding new streets. Widening switches on in later sections, once the character value `t` reaches `THICKEN_FROM` (0.3). From then on each sprout widens the street it came from, which is how roads become main streets.

**Which way.** Perpendicular to the parent street, plus a random wobble whose typical size is the old-core junction angle: 11° off square. Old cores look irregular overall, but the study found their individual junctions are close to right angles. The irregularity comes from many near-square junctions all slightly off, not from sharp angles.

**How long.** A new street isn't given a length; it's given a destination. Looking straight ahead, `spawnIsLegal()` finds the first street it would meet, or the section edge. That distance is its length. It only counts streets within `MAX_REACH` × the old-core segment length (6 × 15 px). If none is that close, the street runs all the way out to the section edge instead: with nothing in its way, it becomes a long road out of town that later streets fill in around. Either way, every street leads somewhere, which is why the core has almost no dead ends.

**Aiming for junctions.** If the street would land near an existing junction (within `AIM_R` × the side-street spacing), it's tilted to land exactly on it, as long as that tilts it by no more than `AIM_MAX` (10°). Landing on a T-junction from its open side turns it into a crossroads. Together with `P_CROSS`, this brings crossroads to 26–34% of junctions, close to the old-core 35%. Before these two rules it was about 12%, because a street only rarely landed on a junction by chance.

**Is it legal?** `spawnIsLegal()` also rejects a sprout if:

- it would make a junction sharper than 60°, at either end. It must leave its parent street, and meet the street it's heading for, at close to a right angle. Glancing junctions were what made triangles;
- it would meet the other street just beside an existing junction (closer than half the side-street spacing). It either lands exactly on the junction, making a crossroads, or well clear of it;
- it would hit another street within 6 px, making a sliver segment;
- it would run alongside a street going the same way (within 30° of parallel) closer than `JUNCTION_GAP` × the block side (about 10 px). This is what spaces side streets evenly along a main street.

If it passes those checks and would join another street, `tryStart()` tries it out: it adds the street for a moment, measures the blocks on either side, and takes it away again. If either side would be smaller than a minimum block, the street never starts. Without this trial, many new streets grew and then faded straight away, which looked like streets being cut off.

In testing, about 200 streets started over the hour. Most seconds find nothing legal once the core fills up, so the city slows down on its own, which is what you want.

---

## Step 6: growing a street

A new street doesn't appear all at once. It grows over three seconds, 1.5 px at a time, always in a straight line: its heading is fixed when it sprouts and never changes. The organic look comes from the angles between streets, not from curves. Each step checks what's ahead:

**Another street within reach.** The step looks ahead by its own length plus `SNAP_R`. If it would meet a street, it stops there, splits that street, and forms a T-junction. Sometimes it carries straight on through to make a crossroads; how often is set by the old-core share of four-way junctions (35%).

**The section edge.** It stops there as a gate. The next section's streets will connect to it.

**The river.** It stops short. There's no river in section 1, but the check is already in place for later sections.

**Its destination is gone.** Rarely, the street it was heading for fades before it arrives. Then it stops as a dead end.

When a street finishes, `checkNewStreet()` checks again that it hasn't cut an area into a piece smaller than a minimum block, in case another street finished nearby while it was growing. If it has, it fades. This happens only a handful of times an hour. The same rule covers splitting a block that's already filled: it's allowed only if both halves are at least block-sized.

---

## Step 7: finding blocks

A block is an area enclosed by streets. In graph terms that's a **face**. Finding faces is the least intuitive part of the code, so here it is in pieces.

**First, ignore dead ends.** A dead-end street can't be the edge of a block. `findFaces()` repeatedly removes any node with only one street until none are left. What remains is called the *2-core*.

**Then walk around each face.** At every node, list the streets leaving it, sorted by angle. Now walk: arrive at a node along a street, and leave by the next street round in that sorted order. Keep going until you're back where you started. You have traced one face.

```js
const list2 = out.get(cur.to);                                       // streets leaving the node we arrived at
const idx = list2.findIndex(h => h.e === cur.e && h.to === cur.from); // the one we arrived on
const nx = list2[(idx + 1) % list2.length];                          // leave by the next one round
```

Each street is walked once in each direction, since it borders a face on each side. One of the traced faces per connected cluster is the outside of the whole cluster. The signed area tells them apart: with y pointing down, enclosed faces come out negative and the outside positive.

**Finally, count corners.** The brief asks for four-sided blocks, but a face's outline can have extra vertices: every T-junction along a side adds one, and streets meeting almost in line add a slight bend. `countCorners()` simplifies the outline, then counts only turns sharper than 35°. A side with a T-junction or a slight bend still counts as one side. For later sections this tolerance tightens toward 15°, for cleaner, squarer blocks.

---

## Step 8: one block every minute

On each minute, `fillBlock()` collects every face that:

- has exactly four corners, each within 35° of square (`RECT_TOL`);
- is between 0.4× and 2.5× the target block size (the section's land × 0.65, divided by 60 blocks);
- lies inside the section;
- isn't already filled. A face inside a filled block but much smaller than it is half of a split block; it may be filled again, but scores lower.

It scores each candidate, preferring faces near the target size, compact shapes, faces bordered by permanent streets, faces near the centre early in the hour, and new ground over re-splitting. Then it picks one with a weighted random draw, so it usually takes the best but sometimes a runner-up.

The chosen block is filled beige at 50% opacity, and its streets become `CEMENTED`. (From `THICKEN_FROM` on, they also get slightly wider.) If no face qualifies, the minute is owed: the next successful minute fills two.

In eight test seeds, section 1 reached 60 of 60 blocks by the end of the hour. (An earlier version could count the same block more than once. That's fixed: a face counts as already filled if it matches *any* filled block, not just the first one found.)

---

## Step 9: keeping the old-city character

After each block, `prune()` looks at the streets within 250 m of it: the same window size as the street-geometry study. It measures six features of that neighbourhood:

| Feature | Old-core target |
|---|---|
| Orientation entropy (how evenly street directions are spread) | 0.97 |
| Share of street ends that are dead ends | 0.02 |
| Average junction angle away from square | 11° |
| Average segment length | 45 m |
| Circuity (street length ÷ straight-line length) | 1.03 |
| Share of junctions that are four-way | 0.35 |

Now that every street is straight, circuity is always 1.0, so it no longer affects which streets are faded. It stays in the list in case bent streets ever come back.

It turns them into one distance from the target: each feature's gap, divided by a typical spread, squared, and weighted roughly by how strong a cue it was in the study. Then, for each provisional street, it asks: *would the neighbourhood be closer to the target without this street?* If one street is hurting the character by more than `PRUNE_EPS`, the worst offender starts fading. That's at most one a minute, and in testing about ten an hour.

Two guards stop pruning from wrecking the network. It never removes a street whose removal would cut the city in two, and never touches gate streets, which later sections need. If a minute passes with no block, `prune()` runs over the whole section instead.

These targets are approximations from the study's headline findings. They're gathered in `OLD` and `NEW` at the top of `sim.js`, so you can swap in the real numbers from `summary_table_750m.csv` when you want to.

---

## Step 10: drawing

`drawWorld()` draws, in order:

1. the map;
2. filled blocks;
3. the newest blocks' outlines, pulsing and fading over five seconds;
4. streets: provisional ones slightly transparent, fading ones by their current opacity, widths as stored;
5. streets still growing.

**Snapping without jumping.** A growing street stops a few pixels short of the street it's heading for, because it looks ahead by `SNAP_R`. Its end then joins the exact junction point, which can also be a little to one side if it snaps onto an existing node. Drawn directly, the end would visibly jump. So `finish()` in `sim.js` records where the growing tip really was (`e.snap.from`), and `drawSnap()` in `sketch.js` animates the difference over `SNAP_MS` (700 ms of real time). For the first half, the street is drawn as a thin wedge from its start whose far end swells from the old tip until it covers the junction. For the second half, the wedge narrows onto the junction, leaving the normal line. Because the wedge is pinned at the street's start, the swelling is widest at the end that moved. Streets that snapped while the sketch was catching up on load aren't animated.

For section 1 this is only a few hundred shapes, so everything is redrawn every frame. Later, when the whole city is on screen, cemented streets and blocks will be drawn once into an off-screen layer and only live streets redrawn each frame.

---

## Things to try

| Setting | Where | What it does |
|---|---|---|
| `MAX_REACH` | `sim.js` | How far a new street will look for another street to join before running out to the edge instead |
| `P_CROSS` | `sim.js` | How often a new street continues a side street across its main street. 0 turns the crossroads rule off |
| `AIM_R`, `AIM_MAX` | `sim.js` | How near a junction a street must be heading, and how far it may tilt, to be steered onto it |
| `CORNER_TOL` | `sim.js` | Lower means only clean four-sided blocks qualify; watch the block count drop |
| `RECT_TOL` | `sim.js` | How far from square a block's corners may be. Raise it for looser, more wedge-shaped blocks |
| `MIN_ANGLE` | `sim.js` | Sharpest junction allowed. Lower it toward 30 to see the triangles come back |
| `JUNCTION_GAP` | `sim.js` | Spacing of side streets. Higher gives fewer, bigger blocks |
| `SNAP_MS` | `sketch.js` | How long the snap swell takes. Set it to 7000 to watch it in slow motion |
| `FRONT_START` | `sim.js` | Set to 1 to let the whole circle grow at once instead of from the centre outward |
| `FILL_FRAC` | `sim.js` | Sets the target block size, and so how much of the core ends up filled |
| `PRUNE_EPS` | `sim.js` | Lower fades more streets each minute; higher fades fewer |
| `THICKEN_FROM` | `sim.js` | Set to 0 to see widening in the old core |
| `t` | `sketch.js`, in `startHour()` | 0 is old core. Try 1 to see section 1 grown with the postwar-estate character |

---

## What changes for the rest of the clock

- `startHour()` looks up the hour in `HOURS` instead of always building section 1. It passes that section's outline, its character `t`, and its block quota.
- Each new section keeps the streets from the ones before. Its growth starts from the gates and streets on its edge, instead of from a single centre node.
- In section 4's last minute, the bridge is drawn from `BRIDGE.near` to `BRIDGE.far`. Section 4.5 then seeds from the far end, the way section 1 seeds from the centre.
- The camera target follows the active section's ring, not just section 1's.
- Cemented streets and blocks are baked into an off-screen layer.
