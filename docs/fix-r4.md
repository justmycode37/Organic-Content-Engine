# Fix round 4 — from the director review of cut 3 (clarity 6, smoothness 4, polish 5, thumb-stop 6)

Already done by the lead: full-frame push transitions are now a short 7 % "nudge" with a fade (fx/transitions.ts);
handoff returns land on their word. Narration is now one continuous take at natural speed, so the reel is 36.4 s and
the event times changed: use the NEW timed spec chatgpt-site/.motion-cache/render-cc32557d879ad4027f01/spec.json
(scene start times: handoff 0 · handoff 2.77 · price 6.97 · store 9.83 · wait 11.93 · news 14.03 · rush 15.87 ·
price 18.27 · demand 21.03 · runto 23.37 · trade 25.13 · queue 26.5 · loop 29.7 · squeeze 32.5 · end 36.4; event
times are listed per scene in that file as seconds from the scene start).
Render stills: `cd chatgpt-site && node scripts/motion.mjs shot .motion-cache/render-cc32557d879ad4027f01/spec.json out.png <reel times>`.

Read first: docs/shot-library.md hard rules (uniform scale: actors 1, hero items 1, carried/secondary items exactly
0.5), docs/fix-r3.md general rules (actions land ON the word; physical paw-to-paw hand-overs; ≤ 40 stage px/frame;
max three big things). Never git checkout/stash/reset/commit; edit only your files.

Per shot:
- rush: buyers and their tickets overlap (clarity 3/10). Re-space: buyer 1 starts ≈ 0.12 s before 'rush', buyer 2
  ≈ 0.12 s before 'last', distinct hand-off points (≈ x 230 and x 390 on the 720 stage), never overlapping; stock
  changes on the events, SOLD OUT appears within 0.15 s after the last purchase. Max three big things (booth +
  two buyers; no watcher).
- trade: ticket held at 0.36 → exactly 0.5; the impact ring must sit below the ticket so ADMIT ONE stays readable.
- runto: booth drawn at 0.48 and crossing the right safe edge → booth at scale 1.0 fully inside x ≤ 696 (centre
  ≈ x 470–500), stationary; Hedgy finishes beside the counter ON 'buy'.
- news: poster 0.66 → 1.0 (fit it on the left half, actor right, nothing clipped); an announcement emphasis (poster
  pulse + megaphone-style burst lines) ON 'announces'; REUNION word lands ON 'reunion'.
- wait: clock 0.62 → choose: hero clock at 1.0 (preferred) or exactly 0.5; the HYPE fade must visibly START on
  'fade' (first opacity drop within 0.03 s of the event).
