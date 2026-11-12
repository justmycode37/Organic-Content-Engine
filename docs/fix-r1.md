# Fix round 1 — per-shot defect list (resume instructions)

A previous agent started these fixes and was INTERRUPTED mid-edit. Start by inspecting the current state of
your files (they may be half-rewritten, may not typecheck, one may be missing) and `git diff`/`git status`
for them (read-only git only: never checkout/stash/reset/commit). Keep what is good, finish or redo the rest.

Read completely first: docs/shot-author-task.md, docs/shot-library.md (especially the last section "REVIEW
ROUND 1 — hard rules"), docs/clean-brief.md section 8, chatgpt-site/src/motion/shots/common.ts and the
reference shot handoff.ts (render it to see the target scale and look). First cut for context:
artifacts/hedgy/clean-v1-sheet.png, artifacts/hedgy/clean-v1.mp4; real reel timing: docs/clean-timed-spec.json
(`cd chatgpt-site && node scripts/motion.mjs shot ../docs/clean-timed-spec.json out.png <reel times…>`).
If the shared tree does not bundle because ANOTHER agent's shot is broken, render via a temporary copy of
the tree outside the repo with a minimal shots/index.ts — never edit the real index.ts except to restore a
missing registration of your own shot.

## Defects by shot
- price (reel 6.2–8.77 falling/green, 16.9–19.03 rising/red): actor and ticket tiny, thin short stair in a corner,
  LOSS bar = unreadable red box. Wanted: actor scale 1 on the floor at one side; THICK (≥ 30) stepped price line
  spanning most of the stage (rising lower-left → upper-right; falling upper-left → lower-right), one bold step per
  event with anticipation and a deep thump, chunky arrowhead; item (scale 0.5) rides the head of the line clear of
  the actor's face; loss/gain = chunky red/green bar with an ink-on-paper label plate; actor reacts on every step.
- compare, balance, equation: uniform scale, fill the stage, paper label plates, faces clear, no dead holds, all in frame.
- demand (reel 19.03–20.87): actors tiny. Wanted: demander left at scale 1 with open-palm thrust, speech bubble
  plate (ink on paper) with the wanted item icon (0.5) and word; the other actor right opens a clearly EMPTY brown
  wallet and turns it upside down, sweating/sad; faces clear.
- runto (reel 20.87–22.6): actor tiny. Wanted: scale 1, readable run cycle without foot sliding (footfall cues),
  destination booth full size sliding in from the right, skid + squash + poof at the counter; carried item at the paw.
- news (reel 12.97–14.93): poster pushes the actor off the right edge; filler plate "BIG NEWS JUST DROPPED" — remove
  it (label only via a `label` param); actor fully in frame at scale 1 beside the poster; strong reaction on event 2.
- present, stamp: audit; stamp = red text on a PAPER plate, readable, wraps to two lines, inside the frame.
- queue (reel 23.9–26.6): booth and buyers tiny. Wanted: booth full size at one side, 2–3 buyers at scale 1 stepping
  up one at a time (at most 2 visible at once is fine), each purchase pops a 0.5 item to the paw; THICK red/green
  price line on the other side ratchets one bold step per purchase with a deep thump.
- rush (reel 14.93–16.9): grabbed tickets cover the rabbits' faces; "STOCK 3" plate is filler — remove; items go to
  the paws below the chin or above the head with a gap; no foot sliding; all in frame.
- trade (reel 22.6–23.9, only 1.3 s in the reel): both beats must read at 1.3 s; payment pile clearly big for price high.
- store, wait: 23–25 frame near-still runs — add purposeful motion, first action within 0.25 s; waiting must be unmistakable.
- grow, split, protect: full audit against all hard rules with ≥ 4 different param sets; fix dead holds; better acting.
- loop (reel 26.6–29.27): diagram is a small cluster with tiny unplated text and a tiny actor. Wanted: a LARGE thick
  pixel loop arrow (radius ≈ 230–260) centred near (360, 360), 3–4 nodes ON the ring (item icons at 0.5 on paper
  discs or ink-on-paper word plates) pulsing as a bright marker passes, laps visibly accelerating, clear direction
  arrowheads; actor at scale 1 on the floor reacting more each lap; no lap counter unless a param asks. NOTE: loop.ts
  may be MISSING from the tree — recreate it (export `loopShot`, name 'loop', stage 'clean'; it is already
  registered in index.ts).
- squeeze (reel 29.27–32.47): stamp is red text in a dark box, unreadable — red on PAPER, big, two lines if needed,
  inside the frame, not over faces; three clearly distinct ratchet steps with victims compressing more each time;
  strong, still-moving final composition (often the last shot of a reel).

## Done means
Typecheck clean for your files (`npx tsc -p tsconfig.json --noEmit`), stills from the real reel timing and from
scratch specs with ≥ 3 param sets per shot LOOKED at critically over ≥ 3 rounds, 12 consecutive frames around each
action checked, report with what changed, final describe lines and paths to contact sheets.
