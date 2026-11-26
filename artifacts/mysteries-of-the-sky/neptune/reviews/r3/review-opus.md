SCORE: 66/100

# Neptune r3 — independent review (opus)

Candidate: `r3.mp4` (10:37, 1280×720, 24 fps). Compared against the Quanta reference (16:24).
Method: 5 s contact sheets across the whole cut, reference sheets from earlier rounds, 4 fps strips at
20 moments and 1 fps strips at 18 moments in ours, full-resolution frames of suspect shots, the
subtitle track for timing, ffmpeg `freezedetect` (n=0.002, d=2 s) and per-frame luma-difference
(YDIF) across the whole film.

## Sub-scores

| Area | r2 | r3 |
|---|---|---|
| Pace & continuous motion | 14/25 | 16/25 |
| Animation craft & richness | 13/25 | 14/25 |
| Explanatory clarity of visuals | 14/20 | 13/20 |
| Style & palette fidelity | 12/15 | 12/15 |
| Continuity & transitions | 10/15 | 11/15 |
| **Total** | **63/100** | **66/100** |

The motion, framing and build-on fixes are real. The score rises less than they deserve because
the new animated "speeding up / closest approach" diagrams, which carry the film's central idea,
show the wrong geometry. Clarity falls for that reason.

## Round-2 points: fixed vs. remaining

**Fixed**
- Hard freeze at 6:24: none remain. `freezedetect` finds no frozen stretch ≥ 2 s anywhere.
- Motion energy: median YDIF went from 0.18 to 0.31 and the mean from 0.40 to 0.60. The share of 5 s
  windows with a median below 0.3 dropped from 84% to 51%. The reference measures 0.48 median,
  1.36 mean and 14%.
- Hypothesis diagram (2:17–2:52): labels now sit inside the frame, there is no zoom pumping, Jupiter,
  Saturn and Uranus are labelled, the three hypotheses are cued to the words, and "something unseen"
  is coral.
- Transit eyepiece (1:34–2:10): it now builds in steps. The star crosses the wire, the clock stops at
  21h 14m 08.3s, the graduated arc gives the altitude, the "1843 Greenwich / 1844 Paris" ledger
  appears, and then the refraction inset. Each step is well synced to the narration.
- Galileo (6:10–6:23): Jupiter-and-moons rows for 28 Dec, 27 Jan and 28 Jan, with the Neptune dot
  ringed "moved", replace the frozen notebook.
- Opening (0:00–0:12): tiles now grow, take over the frame and resolve into the star field instead
  of only blinking.
- Challis ledger: the RAs (21h58.4m → 21h57.6m, decreasing) are now plausible for Neptune
  retrograding toward Galle's 21h53m, and it is captioned "values illustrative".
- Berlin chart is no longer clipped, and the chart vs. eyepiece tick-off works (4:12–4:37).
- The GR crossfade text collision near 9:20 is gone. The GR scene is now a tilted 3D well with a
  chartreuse "+43″ per century" arc. This is the best new shot in the film.
- Chartreuse discipline is much better. "Something unseen", "strongest clues" and "possible ninth
  planet" are no longer chartreuse.
- New Uranus | Mercury split (8:40–8:50) with "missing piece: a planet / a better theory of gravity".
  It is clear and well timed.
- Mercury rosette now has a dashed "Vulcan?" inner orbit (8:28–8:37).
- Triton now has "spin" and "orbit" labels.

**Remaining**
- Uranus is still a featureless pink-cream CG ball (0:23–0:31 and 0:52).
- Still hard cuts from Neptune to Uranus (0:23).
- Bath star field (0:45–0:52): still no ringed fuzzy disc and nothing visibly moving against the
  stars.
- Portraits are still static (no puppeting) and diagrams are still hairline circles and small dots.
- Triton plumes (7:29–7:34): the black hatch strokes are gone, but now no plumes are shown at all
  while the narration says "dark plumes".
- Triton "backwards" (6:45–6:51): the "spin" hook and the "orbit" label have no arrowheads, so the
  opposite directions still are not shown.
- No candidate Vulcan dot crossing the Sun for "claimed to have seen it crossing the sun".
- The twist still loops its year counter (1800→1846, then back to 1800 at ~5:53).

## Pace & continuous motion — 16/25
- There are no freezes, and the 1:34–2:10 and 2:17–2:52 sections now carry several beats each.
- The film still runs at about two-thirds of the reference's median motion and under half its mean.
  The slowest stretches (5 s median YDIF ≤ 0.17) are:
  - 0:10–0:15 and 0:45–0:50 (star fields)
  - 1:10–1:15 and 1:50–1:55
  - 3:45–3:50
  - 6:10–6:45: Galileo rows, then a ~12 s gridded star field with one ringed dot, then Triton,
    nine of ten windows ≤ 0.17
  - 7:30 (Triton still) and 7:47–7:58 (JWST still, slight zoom)
  - 9:27–9:50: about 23 s of a near-static cluster of ellipses for the ninth planet
- The edit rhythm is better, but several 10–20 s single compositions remain: the equation over
  contours (3:02–3:22), the Uranus | Mercury split and the planet-nine ellipses.

## Animation craft & richness — 14/25
- Gains: the GR well with depth and glow, the tile takeover into the star field, the step-built
  eyepiece and the Voyager push.
- Diagrams are still mostly 1 px orbits and 4–6 px dots with soft glow and no shaded bodies. Beside
  the reference's grainy gradient spheres, rotating boxes and flowing fields, most of the middle hour
  reads as a technical schematic.
- Weak assets:
  - the CG Uranus ball
  - the Triton disc (blurry pink blob, no plumes)
  - Galileo rows as plain dots on cream with no sketch texture or hand
  - JWST held as a flat still

## Explanatory clarity — 13/20
- **Key-idea diagrams are physically wrong (3:28–3:47 and 5:22–6:08).** Uranus passed Neptune
  (heliocentric conjunction) in about 1821–22. It was pulled ahead before that and held back after.
  - In the "think of it like this" animation, Uranus starts about 70° behind Neptune in 1800. It is
    labelled "speeding up" until ~1819 and "slowing down" from 1826 while still behind and closing.
    It reaches Neptune only in 1845–46. The words say "speeds up as it approaches … slows down as it
    pulls away", but the picture shows slowing while approaching and never pulling away.
  - The twist diagram repeats the error. The dots coincide in 1841–46 under "closest approach · the
    clues are strongest", so closest approach looks like the 1840s.
  - The caption then stays on through the looped 1800–1826 replay, while the two planets are far
    apart.
  - The real point, a sharp prediction from the 1810s–1830s pass, is lost or contradicted. Viewers
    will come away with the wrong mechanism.
- **Residual graph (1:00–1:34) contradicts the narration.** "Observed − predicted" is largest at 1690
  and falls to about zero by ~1820. The chartreuse "−2′" label sits on the near-zero stretch while
  the narration says "the gap kept growing … by the 1840s … about two arcminutes". The curve should
  sit near zero through Bouvard's 1821 fit, then grow to ~2′ by 1846. Pre-1781 points belong to the
  "fit the old" beat. The full-Moon circle has no scale relation to the curve's amplitude.
- The predicted planet dot rides almost on top of Neptune for the whole twist. "His predicted orbit
  was quite different from the real one" is shown only by a faint dashed circle.
- Working well:
  - "fit the old / fit the new" (1:13–1:20)
  - eyepiece steps
  - hypotheses
  - Le Verrier → equation ("known motion → unknown mass, distance, position")
  - Capricornus with "≈5° east of δ Capricorni" and "predicted"
  - chart vs. eyepiece with "within about 1°"
  - the Challis ledger
  - starlight dips for the ring occultations (7:36–7:42)
  - 1846 → 2011 one-orbit sweep
  - Uranus | Mercury split
  - GR well
  - exoplanet wobble and transit-timing ticks
- "The next night, it had moved slightly against the stars" (4:37) is not shown: the chart and
  eyepiece hold.
- Other on-screen facts check out: 1781 Bath, 31 Aug 1846, ≈5° east of δ Cap, 23 Sep, within ~1°,
  Galileo Dec 1612 and Jan 1613, ≈17 Earth masses, 1989, 2011, 43″ per century, 1859 and 1915.

## Style & palette — 12/15
- Gradients and blooms throughout, no flat fills, consistent graded portraits and cream paper scenes.
- Chartreuse is now close to "measured values only": −2′, the clock and altitude readout, within 1°,
  ≈17 Earth masses, 43″ and the wobble curve. Remaining slips are the chartreuse "speeding up" trail
  (3:28–3:40) and the "−2′" sitting on the wrong part of the curve.
- The palette still reads violet and indigo night. Brick, wine and coral appear mainly as labels and
  tiles, and there is no dusk horizon warmth in the sky scenes. The Uranus ball's peach-white is
  off-palette in brightness.
- Typography is restrained and consistent.

## Continuity & transitions — 11/15
- The clipping and pumping problems are fixed, the Berlin chart is fixed, and the GR to wobble
  change is clean.
- Labels collide when the dots converge:
  - 3:42–3:47: "Uranus" over "Neptune" and "slowing down"
  - 5:40–5:52: "Nept/Uranus" overprint
- The twist's year counter jumps 1846 → 1800 mid-thought (~5:53).
- Hard cuts are still used where a morph is natural: the ringed point to Neptune (0:16), Neptune to
  Uranus (0:23), and the Triton orbit to the Triton still.
- Rowan's lines play as a "Professor Rowan Ellery" card over the orbit diagrams (3:28–3:47,
  5:52–6:08, 8:40–8:50). They are acceptable as a stopgap and noted only lightly.

## Weakest moments (timestamps)

1. **3:28–3:47**: "speeding up / slowing down" animation. Conjunction lands in 1846, Uranus slows
   while approaching, labels overprint, and the trail is chartreuse.
2. **5:22–6:08**: the twist. Closest approach is shown in the 1840s, the caption persists through a
   looped replay with the planets apart, the counter resets, and the predicted dot is
   indistinguishable from Neptune.
3. **1:00–1:34**: the residual curve shrinks toward the 1840s while the words say it grew, and the
   "−2′" label sits on the flat part.
4. **6:23–6:45**: about 20 s of near-static star field with a ringed dot, then a Triton loop where
   "backwards" has no arrows.
5. **0:23–0:31 and 0:45–0:52**: CG Uranus ball with a "predicted" dashed circle around the ball
   itself, which is meaningless. The Bath field shows no fuzzy disc and no motion.
6. **7:29–7:34**: "dark plumes" over a blurry Triton with no plumes.
7. **9:27–9:50**: planet-nine ellipses held about 23 s with almost no motion, and no candidate orbit
   or shepherding shown.
8. **7:47–7:58**: JWST held as a near-still.

## Top 8 changes, ranked by score impact

1. **Re-time both Uranus–Neptune animations to real geometry.** Put conjunction at about 1821–22.
   Uranus should start behind and be pulled forward ("speeding up", 1800–1821), pass Neptune, then
   be held back ("slowing down", 1822–1846) as it pulls away. By 1846 the two should be about 50°
   apart. In the twist, flash "closest approach" only around 1815–1830 at the peak pull arrow, run the
   years once without looping, and keep the caption off-screen when the planets are apart. Show the
   predicted planet's dot visibly diverging from Neptune outside that window (on its larger dashed
   orbit), converging in direction only around the pass and in 1846.
2. **Redraw the residual curve to match the story.** Keep it near zero through ~1821, then show it
   bending away to ~2′ by 1846. Put "−2′" (or "~2′") at the 1840s end, and size the full-Moon
   comparison so 2′ visibly equals 1/15 of its diameter on the same scale.
3. **Replace the Uranus CG ball with a graded real Uranus image** (Voyager or Keck) with limb
   darkening, and drop or re-mean the dashed circle around it. Morph the ringed point into Neptune
   and Neptune into Uranus instead of hard cuts.
4. **Lift the slow stretches (6:23–6:45, 7:29–7:34, 7:47–7:58, 9:27–9:50) with one purposeful action
   each:**
   - pick out the faint dot and shift it a few pixels between "nights"
   - add drifting dark plume streaks on Triton
   - parallax and slow rotation on JWST with ring and moon callouts timed to "rings" and
     "seven moons"
   - one candidate orbit sweeping in, aligned with the clustered ellipses, for planet nine
5. **Give diagram bodies volume.** Use shaded, grain-gradient spheres for the Sun, Uranus, Neptune and
   Jupiter in the orbit scenes, add a parallax star layer, and add a slow camera drift on every
   diagram. Target the reference's ~0.5 median motion.
6. **Show "backwards" and Bath literally.** Add arrowheads on Neptune's spin and on Triton's orbit in
   contrasting directions. In Bath, ring a slightly fuzzy disc and step it across the stars over "the
   following nights". Add the "next night it had moved" step after the 4:34 hit.
7. **Fix label collisions when dots converge** with leader lines or offset labels, and keep the
   "speeding up" trail lilac. Chartreuse stays for measured values only.
8. **Warm the palette.** Add a brick-to-coral horizon glow under sky and star-chart scenes and some
   wine in the diagram backgrounds so the dusk landscape reads. Puppet one portrait (Le Verrier's head
   or quill) in the opening to match the reference's animated cut-out.
