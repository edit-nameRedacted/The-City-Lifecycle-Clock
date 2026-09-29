# Street Networks of Organic City Cores — Research Process

Sep 28, 2026 · @AC

## Objective

The research asks whether the street layout of city cores that grew without a plan can be measured, summarised as a signature, and then reproduced by an algorithm. The end goal is a generator for a "naturally formed" core. Prague is the model: footpaths became roads, roads became main streets, and the city grew outward from one central point. The generator is meant to drive a p5.js city-growth clock.

Three questions organised the work:

1. How do street segment lengths, junction angles and street orientations differ between each city's oldest core and its contemporary areas?
2. Is there a shared "organic-core" signature, and where does it show up in other areas and at other dates?
3. Can a growth model reproduce that signature?

## Stage 1 — Cities and study areas

Stage 1 compared one old core with one or two contemporary areas in each of four cities: London, Istanbul, Prague and New York. Paris was added before the full run. The cities give a spread of histories:

- a medieval core rebuilt after fire and war (London);
- a Byzantine and Ottoman peninsula (Istanbul);
- a Central European old town (Prague);
- a colonial tip beside an 1811 grid (New York);
- a medieval quarter inside a Haussmann city (Paris).

Each area was sampled as a circle of equal area: 750 m radius, with 500 m and 1,000 m as sensitivity checks. Centre points were checked by reverse geocoding and moved in instances where the first choice was put it outside the district it was meant to represent, or on a site whose streets weren't typical of that district.¹

| City | Old core (centre) | Contemporary areas (centre) | Adjustments made |
| --- | --- | --- | --- |
| London | City of London, Bank (51.5133, −0.0890) | Canary Wharf (51.5054, −0.0235); Thamesmead (51.5010, 0.1180) | none |
| Istanbul | Fatih, Grand Bazaar / Beyazıt (41.0106, 28.9680) | Ataşehir (40.9923, 29.1244); Başakşehir 4.–5. Etap (41.1000, 28.7920) | Başakşehir moved off a gated estate whose roads are private in OSM |
| Prague | Staré Město, Old Town Square (50.0875, 14.4213) | Jižní Město (50.0310, 14.5270) | none |
| Paris | Le Marais (48.8575, 2.3575) | Sarcelles grand ensemble, Lochères (48.9785, 2.3830) | Sarcelles moved from the old village to the postwar estate |
| New York | Lower Manhattan (40.7047, −74.0094), clipped to land and without Battery Park City | Midtown 1811 grid (40.7549, −73.9840); Staten Island, Rossville/Woodrow (40.5500, −74.1990) | Staten Island chosen from 8 candidates for the strongest cul-de-sac pattern |

*¹ Only one centre was moved: Başakşehir, where the first point fell on Metrokent, a gated complex with private internal roads, so it was moved to the public 4th–5th Etap mass housing. Clipping water and Battery Park City out of Lower Manhattan was handled separately.*

&#91;image: Study areas: 500, 750 and 1,000 m circles over the drive network (black) and the pedestrian-inclusive network (grey)\]

## Stage 1 — Information gathering and method

All street networks came from OpenStreetMap [\[1\]](#mewbncxx35k.18445) through the OSMnx library (version 2.1) [\[2\]](#mewbncxx35k.18445). The Overpass and Nominatim servers provided the initial download but the connection proved at times unreliable. Additional downloads went through a retrying fetcher with a local cache.

**Two networks per area:**

- **Drive network** (main analysis): streets open to cars, with motorways and their ramps removed.
- **Pedestrian-inclusive network** (reported separately): adds footpaths, lanes and steps, which matter in the old cores of Istanbul and Prague. Sidewalks and crossings mapped as separate lines were removed, because they duplicate the street next to them.

**Cleaning steps**, needed so that one real junction counts once:

- Nearby nodes were merged into one intersection (12 m tolerance, so nodes up to 24 m apart merge). Merged clusters were capped at 40 m across. Without the cap, dense footpath meshes such as Istanbul's Grand Bazaar fused into single "junctions" hundreds of metres wide.
- Divided roads (two parallel carriageways within 25 m) were counted as one street.
- A "segment" is the stretch of street between two junctions.
- Segments crossing the circle's edge were left out of length statistics.

**Measures:**

| Measure | What it captures | How it is computed |
| --- | --- | --- |
| Segment length | how often streets are interrupted by junctions | median, standard deviation, coefficient of variation (CV) and interquartile range of junction-to-junction lengths |
| Junction angle | how square the junctions are | angle between neighbouring streets, measured over the first 15 m of each street; deviation from the nearest of 90°, 180° or 270° |
| Orientation entropy | how many directions the streets run in | 36 bins of 10°, street length per bin, H = −Σ p ln p (Boeing 2019) [\[3\]](#mewbncxx35k.18445); 1.39 = perfect grid, 3.58 = every direction equally |
| Junction mix | T-junctions vs. crossroads vs. dead ends | share of 3-way and 4-way junctions; share of dead ends |
| Circuity | how winding streets are | street length ÷ straight-line distance between its junctions |

## Stage 1 — Results

Old cores differ from contemporary areas mainly in orientation and junction type, not in how variable their segment lengths are. Findings for the drive network in 750 m circles:

- **Orientation entropy** is highest or tied highest in every old core (3.16–3.46), against 3.00–3.35 elsewhere. Midtown's grid is the outlier at 1.45.
- **Segment lengths are not more variable in old cores.** CV is lower in the old core in London, Prague, Paris and New York. Old cores have short, fairly even segments; newer areas mix long arterials with short cul-de-sacs.
- **Junctions in old cores are close to square** (9–13° off), mostly as T-junctions. Newer areas split into square estates (Midtown, Staten Island, Thamesmead, Jižní Město) and oblique layouts (Canary Wharf, Ataşehir, Başakşehir, 18–21° off).
- **Topology separates them most clearly.** Old cores have more crossroads and few dead ends. Postwar estates are dominated by T-junctions and dead ends (Thamesmead 38%, Jižní Město 33%).

| City | Area | Type | Median segment (m) | Length CV | Off-square (°) | Entropy | 4-way | Dead ends |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| London | City of London | old | 71 | 0.62 | 11.2 | 3.30 | 24% | 21% |
| London | Canary Wharf | new | 81 | 0.78 | 17.7 | 3.13 | 18% | 20% |
| London | Thamesmead | new | 71 | 1.04 | 9.7 | 3.35 | 10% | 38% |
| Istanbul | Fatih | old | 61 | 0.89 | 11.9 | 3.43 | 33% | 17% |
| Istanbul | Ataşehir | new | 124 | 0.66 | 20.7 | 3.26 | 31% | 3% |
| Istanbul | Başakşehir | new | 115 | 0.73 | 20.6 | 3.27 | 21% | 2% |
| Prague | Staré Město | old | 78 | 0.60 | 12.6 | 3.46 | 23% | 16% |
| Prague | Jižní Město | new | 94 | 0.79 | 9.3 | 3.04 | 20% | 33% |
| Paris | Le Marais | old | 91 | 0.57 | 8.7 | 3.16 | 33% | 8% |
| Paris | Sarcelles | new | 108 | 0.68 | 10.6 | 3.00 | 17% | 18% |
| New York | Lower Manhattan | old | 81 | 0.51 | 9.1 | 3.33 | 39% | 1% |
| New York | Midtown grid | new | 86 | 0.62 | 2.8 | 1.45 | 87% | 0% |
| New York | Staten Island | new | 81 | 0.68 | 6.3 | 3.16 | 12% | 19% |

&#91;image: Street orientation for each area, length-weighted, drive network, 750 m (red = old core)\]

&#91;image: Segment length and junction angle distributions, old core (red) against contemporary areas, by city\]

New York's "contemporary" areas are two opposite patterns: a near-perfect grid and a suburban loop estate. The 1811 grid is also older than every other contemporary area in the study.

The conclusions held at 500 m and 1,000 m, and at a tighter 6 m merge tolerance. The main caveats:

- private or gated roads drop out of the drive network (Canary Wharf, the new Istanbul districts);
- the Marais circle includes 19th-century streets and Île Saint-Louis;
- merging junctions removes every segment shorter than about 24 m.

## Stage 2 — From one circle to many windows and square cells, more cities, and Paris in 1380

Stage 2 changed the sampling from one large circle per area to many small overlapping circular windows (250 m radius, centered every 125 m), whose scores were then collapsed into 125 m square cells. It also added dated historical maps of Paris. Two problems prompted the change:

- One 750 m circle yields a single set of numbers per place, too thin to define a "signature" or see where it fades.
- The old cores were not as "continuous" as first assumed. Prague's street network survived the Second World War [\[4\]](#mewbncxx35k.18445), but the Josefov clearance (1893–1913) [\[5\]](#mewbncxx35k.18445) rebuilt part of the Old Town circle. In Paris, London, and Istanbul, peacetime replanning (Haussmann, post-fire rebuilding, road widening) altered street layouts more than war damage.

**Windows and squares.** Every area was covered with windows of 250 m radius, centered every 125 m. Each window gets nine measures and a score for how closely it resembles the organic reference. Because the windows overlap, each 125 m square is covered by about 13 of them. Three ways of turning overlapping windows into one value per square were compared:

- **mean** of the windows covering the square;
- **minimum**, following the proposed formula (A + C) − |A − C|, which equals 2 × min(A, C). A square counts as organic only if every window agrees;
- **deconvolution**: solve for square values whose average inside each window reproduces that window's score.

The minimum proved too strict: one mixed window pulls a square to zero. The deconvolved squares were used from then on.

&#91;image: The same Prague streets sampled three ways: one 750 m circle (Stage 1), overlapping 250 m windows, and the resulting 125 m squares coloured by score\]

**Why a 1380 map of Paris.** Modern Paris is Haussmann's, so a pre-Haussmann network was needed to see the medieval core. Georges-Eugène Haussmann was Prefect of the Seine under Napoleon III from 1853 to 1870. He had long, straight boulevards cut through the medieval street fabric, cleared much of the old centre (including most of the Île de la Cité's houses), and lined the new streets with uniform apartment blocks. As a result, much of central Paris today follows his plan rather than its medieval layout, and even the surviving old quarters, such as the Marais, are hemmed in by his boulevards. [\[6\]](#mewbncxx35k.18445)[\[7\]](#mewbncxx35k.18445)&#32;

The ALPAGE project [\[8\]](#mewbncxx35k.18445) has digitised Paris street networks for 1300, 1380, 1553 and 1791; GeoHistoricalData supplied the 1825–36 Jacoubet atlas [\[9\]](#mewbncxx35k.18445). The 1380 layer was chosen as the reference because it is the complete walled city of Charles V, unplanned and centuries before Haussmann. The other years let the same territory be tracked through time.

&#91;image: Paris in 1380 (ALPAGE) and the same territory today (OpenStreetMap)\]

**Other decisions in Stage 2:**

- **Reference cores.** The signature is defined by two cores together: Staré Město (from OSM, with Josefov scored separately) and Paris 1380.
- **Comparable networks.** Modern areas were measured as "named public ways": drive streets plus pedestrian streets, alleys and named footpaths and steps. This matches what a historical street map records.
- **Larger areas for the ring analysis.** 3 km around each old centre (4 km for New York): Old Town Square, Île de la Cité, Bank, Hagia Sophia and Bowling Green. London, Istanbul and New York had to be downloaded from a mirror Overpass server after the main one stopped responding.

## Stage 2 — Findings

A shared organic-core signature exists, but only when both reference cores define it. Where it fades with distance, it drops in a step at the old city limits rather than a smooth gradient.

**The signature needs both cores.** Built from Prague alone, it rated medieval Paris windows as atypical (median 0.04). It separated Paris from planned districts only moderately (AUC 0.72). Built from Paris 1380 alone, it rated Prague at 0.11 (AUC 0.81). Built from both, it separates cleanly:

- planned districts score 0.11 or lower (Midtown 0.00);
- old cores score 0.19–0.45;
- Paris before Haussmann scores 0.40–0.67.

Its strongest cues are:

- many street directions;
- few dead ends;
- square junctions;
- short segments;
- streets running fairly straight between junctions.

**Where it shows up.** Fatih (Istanbul) scores highest outside the reference (0.45), then the Marais (0.32), Lower Manhattan (0.25) and the City of London (0.19). Prague's Nové Město, a town planned in 1348, scores 0.07. That shows the signature is detecting planning, not age.

&#91;image: Organic-core score of every window, by area (red = old cores, blue = contemporary, gold = historical Paris)\]

&#91;image: Maps of window scores for every area and every Paris map date\]

**Paris through time.** On the same territory, the score rises through the medieval maps, then halves by 2026. The darkest area on the 2026 map is the Île de la Cité, which Haussmann cleared almost entirely [\[7\]](#mewbncxx35k.18445).

&#91;embedded content: signature/score\_summary.csv · Paris, 6 map dates\]

**Rings and distance from the centre.** Decline with distance appeared only where the old core is surrounded by planned growth:

- **New York:** 0.68 at the tip, 0.04 by 1.1 km, where the grid begins.
- **Prague:** 0.70 at the centre, 0.05 by 875 m, the edge of Staré Město. Nové Město scores 0.12, 19th-century districts 0.01–0.15.
- **Paris:** 0.36 inside the 1380 walls, 0.18 in the growth up to 1791. This gap mostly disappears when Paris is left out of the signature.
- **Istanbul:** no decline; the peak is at Vefa, 1.8 km out.
- **London:** reversed; the City (0.17) scores below the ring around it (0.28).

&#91;image: Median square score by 250 m ring from each old centre, for the four ways of handling window overlap\]

&#91;image: Prague by district and Paris by historic city limit\]

Beyond the first edge the score levels off, with separate high spots. These are mostly old villages or towns the city absorbed: Clerkenwell, St Giles and Bermondsey in London, Vefa in Istanbul, Malá Strana in Prague. That points to growth from several seeds, not one. No core had streets radiating from its centre. Instead, streets ran slightly around it 800–1,000 m out, near the old walls. Some London postwar estates also scored high, a known false positive.

## Stage 3 — The 1997 Nature paper and how it was integrated

Helbing, Keltsch & Molnár's "Modelling the evolution of human trail systems" (*Nature* 388, 47–50, 1997) [\[10\]](#mewbncxx35k.18445) supplies the "footpaths become roads" mechanism. Walkers wear down the ground where they step, and worn ground attracts later walkers. Unused trails grow back. The model runs on four equations:

```latex
\frac{dG}{dt} = \frac{1}{T}\left[G_0 - G\right] + I\left[1 - \frac{G}{G_{max}}\right]\sum_\alpha \delta(\mathbf{r} - \mathbf{r}_\alpha)
```

```latex
V_{tr}(\mathbf{r}_\alpha, t) = \int d^2r \; e^{-|\mathbf{r}-\mathbf{r}_\alpha|/\sigma} \, G(\mathbf{r}, t)
```

```latex
\mathbf{e}_\alpha = \frac{\mathbf{d}_\alpha - \mathbf{r}_\alpha + \nabla V_{tr}}{\left|\mathbf{d}_\alpha - \mathbf{r}_\alpha + \nabla V_{tr}\right|}
\qquad
\frac{d\mathbf{r}_\alpha}{dt} = v^0_\alpha \, \mathbf{e}_\alpha
```

In words:

- G is how worn the ground is. It grows by I per footstep, up to a maximum, and regrows toward bare ground at rate 1/T.
- V is how attractive nearby worn ground looks from where a walker stands, fading with distance over the visibility range σ.
- Each walker heads toward its destination d but is pulled up the slope of V.
- The whole model depends on only two numbers, κ = IT/σ and λ = V⁰T/σ.

Small κ gives direct paths between destinations; large κ gives a minimal shared path system. In between is a compromise with an "island" in the middle.

The implementation was then tested on the paper's own three-point case (its Fig. 2). It reproduced the sequence from direct triangle to island to near-Y as κ rose. Five choices the paper leaves open were needed:

- the destination term as a unit vector; taken literally as printed, every walker got stuck circling short of its goal;
- trail wear capped at G\_max = σ/(2 × cell size);
- trail pull capped at 0.9 of the destination pull;
- paved destinations;
- λ fixed at 600.

&#91;image: Reproduction of the paper's three-point test: direct triangle at κ = 1, island at κ = 5, near-Y at κ = 20\]

**Integration into a city.** The paper's model produces trails between fixed places; a city needs more. The prototype runs on a 1.3–1.6 km grid for 12 stages, one per clock "hour":

1. Walkers travel between a market square, gates on the edge, and houses.
2. Worn trails above a traffic threshold become the main streets, straightened into line segments.
3. New houses settle near trails, a ring further out each hour.
4. A lane rule fills the blocks: straight lanes leave a street at close to a right angle and stop at the next street they meet.

&#91;embedded content: prototype pipeline · 7 steps, 1 hourly loop\]

**Round 1.** The paper's model alone made only a five-arm star of main streets to the gates, at every κ from 0.5 to 20. The dense street mesh came entirely from the lane rule. Lane wobble controlled junction angle almost perfectly (correlation 0.95). The best settings scored 0.25–0.30, inside the old-core range.

&#91;image: Round 1 prototype at hour 12: walker trails (black) and lanes (red)\]

**Round 2 fixes.** Three changes were tested, then the best combination was checked on 8 random seeds:

- **A grain rule** turning lanes toward the local street direction. It failed: it made junctions less square and lowered the score.
- **Villages and walls:** secondary seeds, plus ring roads with gates at hours 4 and 8. These helped.
- **Fewer, better-connected lanes.** This brought junction density, circuity and the junction mix onto target.

| Measure | Organic target | Round 1 | Round 2 |
| --- | --- | --- | --- |
| Organic-core score (median of 8 seeds) | 0.19–0.45 (old cores) | 0.23 | 0.38 |
| Junctions per km² | 119 | 163 | 120 |
| Dead-end share | 11% | 29% | 24% |
| Orientation entropy | 3.02 | 3.48 | 3.32 |
| Off-square (°) | 11.0 | 14.7 | 15.9 |
| Circuity | 1.07 | 1.15 | 1.09 |

Round 2 scored higher on 6 of 8 seeds, but two seeds collapsed to 0.02, so the gain is not statistically reliable (p = 0.25).

&#91;image: Round 2 growth over 12 hours: walker trails (black), lanes (red), walls and villages (blue)\]

## Discussion — strengths and weaknesses of the model

The model can already generate cities that score like real organic cores, but for partly the wrong reasons, and not reliably. It is a working prototype with a clear list of what to fix, not a finished generator.

**Strengths**

- **Grounded in measurement.** Every target comes from real street networks: five cities, two reference cores and seven dated maps of Paris. Nothing is tuned by eye.
- **An honest yardstick.** The signature separates organic from planned areas, rejects a planned 14th-century town (Nové Město), and detects Haussmann's changes in Paris. The same score judges the generator.
- **A published mechanism, checked.** The trail model was verified against the paper's equations and its own test case before use, and every departure from the paper is documented.
- **Several targets met.** Junction density, circuity, the T-junction and crossroads mix, and near-square junctions are all within reach. Walls and villages reproduce the step-like decline and the absorbed villages seen in real cities.
- **Fits the clock.** It grows in 12 hourly stages, uses only straight segments, and is fully reproducible from code and a random seed.

**Weaknesses**

- **The paper's mechanism does little at city scale.** With one market and a few gates, every setting of κ gives the same star of main streets. The organic texture comes from the added lane rule, which is a hand-made rule rather than an emergent one.
- **No grain.** Real cores run in a few shared directions; the prototype's streets run in too many (entropy 3.32 vs. 3.02). The attempted fix failed. The main streets likely need to share directions, for example by following a river or slope.
- **Too many dead ends** (24% vs. 11%).
- **Unstable.** Two of eight seeds collapsed when villages drew growth away from the core. The round-2 gain is not statistically significant.
- **A thin reference.** The signature rests on two cores. Prague alone could not recognise Paris, so a third or fourth unplanned core would change the targets.
- **Map conventions differ.** OSM maps named passages and courtyards that historical maps leave out, which inflates dead ends in the modern reference.
- **Windows overlap.** Scores are descriptive, not statistical tests.
- **Some false positives.** A few postwar estates also score as organic, so the signature cannot yet tell them apart.

**Next steps**

1. Shape the main streets with a river or terrain instead of a radial star.
2. Keep the core the densest place so villages cannot overtake it.
3. Add more unplanned reference cores.
4. Add a street-hierarchy measure to rule out postwar estates.

## References, data credits and code

1. OpenStreetMap contributors. [OpenStreetMap](https://www.openstreetmap.org/copyright) street data, ODbL. Downloaded via overpass-api.de and, for the London, Istanbul and New York rings, the VK Maps Overpass mirror.
2. Boeing, G. (2025). [Modeling and analyzing urban networks and amenities with OSMnx](https://doi.org/10.1111/gean.70009). *Geographical Analysis* 57(4), 567–577. OSMnx 2.1 was used.
3. Boeing, G. (2019). [Urban spatial order: street network orientation, configuration, and entropy](https://doi.org/10.1007/s41109-019-0189-1). *Applied Network Science* 4, 67. Orientation entropy method.
4. [Bombing of Prague](https://en.wikipedia.org/wiki/Bombing_of_Prague). Wikipedia.
5. [The clearance of Josefov](https://www.old-prague.com/history-prague-the-clearance-of-josefov.php). Old Prague.
6. Britannica Editors. [Georges-Eugène, Baron Haussmann](https://www.britannica.com/biography/Georges-Eugene-Baron-Haussmann). *Encyclopædia Britannica*.
7. [Haussmann's renovation of Paris](https://en.wikipedia.org/wiki/Haussmann%27s_renovation_of_Paris). Wikipedia.
8. [ALPAGE](https://alpage.huma-num.fr/gis-data/) street layers for Paris 1300, 1380, 1553 and 1791. Authors: Caroline Bourlet and Anne-Laure Bethe (1300, 1380), Davide Gherdevich (1553), Léa Hermenault (1791). ODbL; maps made from them are CC BY-SA 2.0.
9. GeoHistoricalData. [Paris 1825–36 street network (Jacoubet atlas)](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/CCESX4). Harvard Dataverse, CC0.
10. Helbing, D., Keltsch, J. & Molnár, P. (1997). [Modelling the evolution of human trail systems](https://doi.org/10.1038/40353). *Nature* 388, 47–50.

Reports and code from this work, in the session outputs:

| Stage | Report | Code |
| --- | --- | --- |
| 1 | street\_geometry\_report.html | code/street\_geometry.py |
| 2 (signature) | signature/signature\_report.html | code/signature.py, code/histnet.py |
| 2 (rings) | rings/rings\_report.html | code/dl\_rings.py, code/rings.py, code/rings\_eras.py |
| 3 | walker/walker\_report.html | code/walker.py and the walker\_\* / v2\_\* scripts |
