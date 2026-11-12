# Fix round 3 — from the director / motion-QA review of cut 2 (clarity 5, smoothness 5, polish 6)

Read first: docs/shot-author-task.md, docs/shot-library.md (hard rules), docs/fix-r2.md (already applied — do not
undo it), chatgpt-site/src/motion/shots/common.ts and handoff.ts (reworked: items now pass paw to paw at chest
height, are shown above the head before/after, and a tag is only out while the item is held up — copy this
"physical" staging wherever something changes hands). Real timing: docs/clean-timed-spec.json; params:
chatgpt-site/motion-examples/hedgy-squeeze-clean.json. Never git checkout/stash/reset/commit; edit only your files.

General (every shot):
- SYNC: the main action of each beat must LAND on its event time (start the anticipation ~0.12 s earlier), not be
  on screen long before it. Example: a price line starts moving ON the event, a stamp slams ON the event.
- PHYSICAL: things that change hands travel paw to paw at chest height (y ≈ 650 on the 720 × 860 stage), never
  float overhead disconnected from the paws, never cross a face.
- READABLE SPEED: nothing the viewer must read moves faster than 40 stage px per frame; no prop may jump more
  than that between two consecutive frames (the review found a booth jumping ~100 px in one frame).
- ARMS: pose changes must pass through in-betweens; no arm may sweep across a muzzle.
- MAX THREE BIG THINGS on screen at a time.

Per shot (reel times):
- runto (20.87–22.6): the BUY booth jumps ~100 px in one frame at 21.60→21.63 and slides during the run. Keep the
  booth stationary once visible (around stage x ≈ 530, or let it ease in ONCE at the start); Hedgy runs from
  x ≈ 160 to ≈ 370 starting on event 1 (21.26) and arrives on the last event (21.94) with skid + squash.
- rush (14.93–16.9): too many things at once. Booth + at most two fans visible at a time, entering and leaving in
  sequence; stock visibly 3 → 2 on event 1 (15.44), 2 → 1 on event 2 (15.86), then SOLD OUT right after the last
  purchase (by ≈ 16.0–16.2), not at 16.8.
- queue (23.9–26.6): the price arrow was clipped at the left edge and purchases were indistinct. Arrow fully
  inside the stage (x 60–660 range), one clear step on each event (24.47, 24.90, 25.90).
- trade (22.6–23.9): the ticket crosses Hedgy's face at 23.24; keep it at paw height; simplify so booth, Hedgy,
  cash pile and ticket each read (cash pile leaves as the ticket arrives).
- price (6.2–8.77 and 16.9–19.03): start the fall ON 'fall' (7.04) and reach the cheaper state on 'cheaper' (8.10)
  — show cheaper as a visibly smaller coin stack / price tag; start the rise ON 'jump' (17.38) and grow the loss
  bar on 'losses' (18.03). Before the first event the item sits on a short flat line (price holding still).
- demand (19.03–20.87): open-hand demand ON 19.61, empty-wallet reveal ON 20.07; "MORE" bubble larger.
- news (12.97–14.93): poster starts moving at the cut and is readable by ≈ 13.2; the word lands ON 14.04; actor
  fully inside the frame.
- wait (11.23–12.97): put the IOU slip in Hedgy's paw (param `item` should accept 'iou' and any item id), one
  clear foot tap around 11.6, and something that visibly fades on event 2 (12.35) — e.g. a small "HYPE" spark or
  confetti above him that droops and fades — keep it generic via a param (`fade` word/item, optional).
- store (8.77–11.23): cash visibly ENTERS the safe on event 1 (9.89), door shuts + padlock on event 2 (10.33).
- squeeze (29.27–32.47): actors are distorted and clipped; limit the squash (≤ 25%, brief), keep both fully in
  frame; add what the narration says: a ticket/price rising (a short thick red line climbing beside the vise or
  the lower jaw rising like a price floor) so "feedback loop → squeeze" is visible; the SHORT SQUEEZE stamp slams
  ON the last event (30.53), not at 31.0; then keep purposeful motion to the end.
- loop (26.6–29.27): keep the loop diagram (the blind viewer understood it, 8/10) but reduce to 3 nodes with
  larger icons, and make the actor's panic bigger; first pulse ON event 1, the "buy back" node ON event 2 (28.03).
