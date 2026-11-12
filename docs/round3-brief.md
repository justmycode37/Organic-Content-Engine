# Round 3 brief (all agents)

v2 improved (visuals 4→5.5, story ~5→7.5, sound 5.5→7) but is not at the bar yet. Read `docs/reviews/v2.md`
(your to-do list), `docs/shot-bible.md`, `docs/motion-v3.md` (ownership: edit only your files; never git
checkout/stash/reset/commit; other agents work concurrently in the same tree).

Narration and timings are unchanged since v2: render with `docs/showcase-timed-spec.json`
(`cd chatgpt-site && node scripts/motion.mjs shot ../docs/showcase-timed-spec.json out.png <reel-times...>`;
silent full reel: `node scripts/motion.mjs render ../docs/showcase-timed-spec.json out.mp4`). Shot starts:
1 0.00 · 2 2.37 · 3 6.20 · 4 8.77 · 5 11.23 · 6 12.97 · 7 14.93 · 8 16.90 · 9 19.03 · 10 20.87 · 11 22.60 ·
12 23.90 · 13 26.60 · 14 29.27 · end 32.67.

Rules for this round:
- Hedgy's full silhouette stays inside a 24 px safe margin in EVERY frame (check bounds with `hedgyBounds`
  after camera transforms; add an assertion in your scratch test that samples every frame of your shots).
- Nothing important covers his face.
- Every story beat: prop travels → reaction → consequence, readable with sound off.
- Keep cue lists sparse; main story hits get gain ~1.3–1.6 and the right physical cue kind (paper, glass,
  clack, thud, impact, stamp, step, land...), secondary ones ~0.5–0.8.
- Verify at full resolution on many frames (every 0.1 s around your beats), plus a silent mp4 of your shots.
