SCORE: 70/100

# Neptune r4 — independent review (opus)

Candidate: `r4.mp4` (10:37, 1280×720, 24 fps). Compared against the Quanta reference (16:24).

**Method**
- 5 s contact sheets across the whole cut.
- Frame strips at 1–3 fps over 16 windows, including the opening, Bath, the residual graph, both
  Uranus–Neptune animations, the next-night step, Galileo → Triton, the plumes, JWST, Vulcan, the
  exoplanets and planet nine.
- Full-resolution crops of suspect frames.
- The subtitle track for timing.
- ffmpeg `freezedetect` (n=0.002, d=2 s), and `signalstats` YDIF on the full frames of r3 and r4 with
  identical settings.

## Sub-scores

| Area | r3 | r4 |
|---|---|---|
| Pace & continuous motion | 16/25 | 16/25 |
| Animation craft & richness | 14/25 | 14/25 |
| Explanatory clarity of visuals | 13/20 | 16/20 |
| Style & palette fidelity | 12/15 | 12/15 |
| Continuity & transitions | 11/15 | 12/15 |
| **Total** | **66/100** | **70/100** |

r4 is a correctness round. The two diagrams that carry the central idea, and the residual graph,
now show the right physics, so clarity rises a lot.

Motion and richness did not change. On the same metric, the median YDIF is 0.29 (r3 0.31) and the
mean is 0.61 (r3 0.60). 52% of 5 s windows have a median below 0.3 (r3 51%). The reference measures
0.48 median, 1.36 mean and 14%. Every slow window from r3 is still slow. The film still reads as a
clean schematic beside the reference's dense, grainy, layered animation.

## Round-3 points: fixed vs. remaining

**Fixed**
- **"Think of it like this" (3:28–3:46).** Conjunction now falls in about 1821–23.
  - Uranus starts behind Neptune and is labelled "speeding up" (1804–1816).
  - It passes Neptune at about 1821, then is labelled "slowing down" while pulling ahead (1823–1846).
  - By 1846 it is about 50–60° ahead.
  - The labels no longer overprint, and the trail is no longer chartreuse.
- **Twist (5:22–6:08).**
  - The 1834→1846 run shows the predicted planet on its larger dashed orbit converging on Neptune,
    with a chartreuse "1846 · within about 1°" (5:35).
  - The animation then rewinds to 1811 for "the decades when it passed Neptune".
  - "Closest approach · the clues are strongest" now appears only for about 1815–1829, when the
    planets really are close.
  - The predicted planet sits visibly ahead of and outside Neptune before 1846, which is the right
    sense for a slower, more distant orbit.
  - Pull lines from Uranus to both bodies appear.
- **Residual graph (0:58–1:34).** It is flat through about 1821, then bends up to "≈ 2′" at the 1840s
  end. The full Moon carries the label "≈ 2′ at this scale". It now matches the words.
- **Next night (4:37).** The found dot steps to a new position with a ghost of the first night and
  a "next night" tag. It is nicely timed.
- **Triton "backwards" (6:47).** A lilac "spin" arrow and a coral "orbit" arrow now point in opposite
  directions.
- **Vulcan.** A dark dot crosses the Sun briefly (about 8:35).
- **Planet nine (9:30–9:50).** A dashed candidate orbit now sits anti-aligned with the clustered
  ellipses.
- **Opening.** The ringed point resolves into Neptune through the tile build (0:17–0:19) instead of a
  hard cut.

**Remaining**
- The Uranus CG ball is unchanged (0:23–0:31 and 0:51). The "where the tables said" dashed circle is
  concentric with the ball, so it says nothing about an offset.
- The cut from Neptune to Uranus is still hard (0:23).
- Bath (0:45–0:52): some stars brighten and soften, but no single fuzzy disc is singled out or seen
  stepping across the stars for "over the following nights it moved".
- The twist still replays its window. After 1811→1833 it crossfades back to 1812→1833 (about 5:52),
  and both year numbers overprint for a few frames ("1812/1833").
- Triton plumes (7:29–7:34): the plumes are a row of smeared dark glyph-like strokes on a soft blob.
  They read as a compression artifact, not geysers.
- JWST (7:47–7:58) is still a near-still with no ring or moon callouts for "rings stand out … seven of
  its moons".
- Portraits are static, and diagram bodies are still small glowing dots on 1 px orbits.
- Motion and pacing are unchanged (see below).

## Pace & continuous motion — 16/25
- There are no freezes of 2 s or longer.
- Slow 5 s windows (median YDIF ≤ 0.17) are the same as in r3:
  - 0:10, 0:45 (star fields)
  - 1:00–1:30 (residual graph builds slowly)
  - 1:45–1:50
  - 3:45–3:50: hold on 1846 "slowing down", about 5 s
  - 4:15 (Berlin chart)
  - 6:05–6:45: rewound twist tail, Galileo rows, then about 10 s on a star field with one ringed dot,
    then the first Triton loop, nine windows in a row
  - 7:30 (Triton)
  - 8:05 (one-orbit sweep start)
  - 8:40 (Uranus | Mercury split)
- The reference keeps a moving element in almost every second. Ours often animates a single 4–6 px
  dot on a large still frame.
- Single compositions still run 10–20 s: the equation over contours (3:02–3:26), the chart and
  eyepiece (4:12–4:42), the Mercury rosette (8:13–8:38) and the planet-nine ellipses (9:30–9:50).

## Animation craft & richness — 14/25
- The best shots are unchanged:
  - the GR well (8:50–9:08)
  - the tile takeovers into portraits and scenes
  - the Voyager push into the Great Dark Spot (7:02–7:25)
  - the step-built transit eyepiece
  - the starlight-dip ring occultation (7:36–7:44)
- The new pull lines, arrows and dashed orbits are hairline additions. They improve meaning, not
  richness.
- There are still no shaded or grain-gradient planet bodies in the orbit scenes, no parallax star
  layer and no camera drift on most diagrams.
- Weak assets:
  - the CG Uranus ball
  - the Triton disc with artifact-looking "plumes"
  - JWST held flat
  - Galileo rows as plain dots on cream with no sketch texture

## Explanatory clarity — 16/20
- The film's core logic is now shown correctly end to end:
  - the residual grows
  - the transit measurement explains how it is seen
  - the hypotheses
  - the inverse problem
  - a correct speed-up and slow-down around conjunction
  - the prediction, the search and the hit, then the next-night motion
  - the twist (wrong orbit, right place near the pass)
- Remaining gaps:
  - **"Pulls on Uranus almost the same way" (5:45–6:04).** The two pull lines from Uranus are tiny
    (about 60 px), unlabelled and about 30° apart at 1821, so they do not read as "almost the same".
    The point "it needed the direction of the pull" deserves bigger arrows that visibly align, or a
    side-by-side of the two pull vectors.
  - **3:37–3:46, "the timing of that speeding up tells you where the other planet must be".** It
    plays over the "slowing down" 1839–1846 phase and a 5 s hold. No mark ties the timing (the
    conjunction year) to a direction.
  - **6:04, "Get that right, and you point to the right part of the sky".** The visual is a 1832
    orbit hold, not a pointer to the sky position in 1846.
  - Bath shows no fuzzy disc and no motion. "Dark plumes" shows no plumes. "Rings stand out … seven
    moons" has no callouts.
  - The Uranus "where the tables said" ring does not show an offset.
- The on-screen facts check out:
  - 1781 Bath, the 1821 Bouvard fit, ≈2′ by the 1840s
  - 21h 14m clock and altitude readouts, labelled as examples
  - 31 Aug 1846, ≈5° east of δ Cap, 23 Sep, within about 1°
  - the Challis Aug 1846 ledger, captioned illustrative
  - conjunction around 1821–22
  - Galileo Dec 1612 and Jan 1613
  - Triton retrograde, ≈17 Earth masses
  - 1989, 2022 JWST, 2011 one orbit
  - 43″ per century, 1859 and 1915
  - planet nine "not yet found"

## Style & palette — 12/15
- Gradient backgrounds and blooms throughout, with consistent cream-paper and graded-portrait
  scenes and restrained serif and sans typography.
- Chartreuse is mostly for measured values: ≈2′, the clock and altitude, within 1°, 1846 within
  about 1°, ≈17 Earth masses, 43″ and the wobble curve.
- Chartreuse slips: the ring around the discovery dot at 0:13 and the ring on the "one faint dot" at
  6:30–6:35 are not measurements.
- The palette still reads violet and indigo night. Wine, brick and coral appear only as labels and
  tiles, and there is no dusk horizon warmth. The peach-white Uranus ball is off-palette in value.

## Continuity & transitions — 12/15
- Better than r3:
  - the tile morph into Neptune
  - no label overprints in the first Uranus–Neptune diagram
  - "closest approach" only shows while the planets are close
  - a clean, intentional rewind at 5:38–5:40
- Remaining:
  - the hard cut from Neptune to Uranus (0:23)
  - the twist's second pass crossfades back from 1833 to 1812 with overprinted year numbers (about
    5:52)
  - the "predicted planet" label is overlapped by its own dot through 5:22–5:40 ("p●edicted")
- Rowan's lines play as a name card over the diagrams (3:28–3:47, 5:52–6:08, 8:40–8:50). They are
  acceptable as a stopgap and noted only lightly.

## Weakest moments (timestamps)

1. **0:23–0:31**: CG peach Uranus ball held about 8 s, with a hard cut in from Neptune and a
   concentric "where the tables said" ring that shows no offset.
2. **6:05–6:45**: the longest slow stretch.
   - It starts on the 1832 twist hold.
   - Galileo dot rows follow, then about 10 s of a star field with one chartreuse-ringed dot.
   - The first Triton orbit loop plays before the arrows arrive.
3. **7:29–7:34**: "dark plumes" over a blurry Triton whose plumes look like smeared glyph artifacts.
4. **5:45–6:08**: the twist's second loop (overprinted 1812/1833 counter). The pull lines are too
   small and too divergent to show "almost the same way", and the shot ends on 1832 instead of
   pointing to the 1846 sky position.
5. **0:45–0:52**: Bath star field with no ringed fuzzy disc and no step-across motion.
6. **3:41–3:46**: about 5 s static hold at 1846 under "the timing of that speeding up tells you
   where…", with nothing marking the conjunction year or direction.
7. **7:47–7:58**: JWST near-still with no ring or moon callouts.
8. **9:30–9:50**: planet-nine ellipses and candidate orbit held about 20 s with little motion. There
   is no visible sweep, and the "clustering" isn't animated.

## Top 8 changes, ranked by score impact

1. **Raise the motion floor everywhere (pace and craft).**
   - Give every diagram a slow camera drift or rotation and a parallax star layer behind it.
   - Animate grain and glow on bodies.
   - Re-cut the 10–20 s single compositions (3:02–3:26, 4:12–4:42, 8:13–8:38, 9:30–9:50) into two or
     three framings each.
   - Target the reference's ~0.5 median YDIF and fewer than 20% slow windows (now 0.29 and 52%).
2. **Give orbit-scene bodies volume.** Use shaded, grain-gradient spheres for the Sun, Uranus,
   Neptune, Jupiter, Saturn and the predicted planet, about 3× the current dot size, with soft
   terminators. This is the biggest craft gap against the reference.
3. **Replace the Uranus CG ball with a graded real Uranus image**, morph Neptune → Uranus, and offset
   the "where the tables said" ghost from the real disc so the error is visible.
4. **Sharpen the twist payoff (5:45–6:08).**
   - Play 1811→1833 once.
   - Freeze at about 1821 and enlarge the two pull arrows (Neptune and predicted) so they visibly
     nearly align, labelled "pull from Neptune / pull from predicted planet".
   - Then run forward to 1846 and draw a line from Earth or the Sun to the shared sky direction for
     "you point to the right part of the sky".
5. **Fix 6:05–6:45.** Shorten the faint-dot star field and make it act. Show the dot shifting between
   "nights", with the ring in lilac rather than chartreuse. Start Triton with the arrows already
   drawing instead of a bare loop.
6. **Fix the literal mismatches.**
   - Draw real dark plume streaks drifting off Triton (7:29), or use a graded Voyager Triton plume
     image.
   - In Bath (0:45), ring a slightly fuzzy disc and step it across the stars.
   - On JWST (7:47), add ring and moon tick callouts timed to "rings" and "seven of its moons" with
     a slow push.
7. **Mark the conjunction in the first diagram (3:37–3:46).** At "the timing of that speeding up",
   flash a "≈1822" tick at the pass and draw an arrow from it toward Neptune's direction instead of
   holding the 1846 frame.
8. **Warm the palette and puppet a portrait.**
   - Add a brick-to-coral horizon glow under the sky and star-chart scenes, and wine in the diagram
     gradients, so the dusk landscape reads.
   - Keep chartreuse off non-measurement rings (0:13, 6:30).
   - Animate one portrait (Le Verrier's head turn or quill) to match the reference's animated
     cut-outs.
