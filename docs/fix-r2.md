# Fix round 2 — from the blind recognizability test of cut 2

A viewer who saw only caption-less frames (artifacts/hedgy/clean-v2-sheet.png, clean-v2-silent.mp4) named the
concept correctly but scored recognizability 7/10. Fix the items for YOUR shots below. Read first:
docs/shot-author-task.md, docs/shot-library.md (incl. "REVIEW ROUND 1 — hard rules"), docs/clean-brief.md §8,
chatgpt-site/src/motion/shots/common.ts, handoff.ts. Real reel timing: docs/clean-timed-spec.json
(`cd chatgpt-site && node scripts/motion.mjs shot ../docs/clean-timed-spec.json out.png <reel times…>`), but
re-read params from chatgpt-site/motion-examples/hedgy-squeeze-clean.json (transitions changed to cut/push).
Never git checkout/stash/reset/commit; edit only your shot files; other agents edit other shots concurrently.
If the tree does not bundle because of another agent's file, render from a temporary copy outside the repo.

General findings that apply to every shot:
- A carried arm must never read as a "narrow object in the paw": items sit visibly IN the paw; empty paws rest.
- No dead holds: the viewer flagged near-identical consecutive frames at the END of shots. After the last beat
  keep a clear secondary action going (acting, a second small event) until the cut.
- Nothing touches or crosses the frame edge (labels were clipped), nothing covers a face (cash on a snout,
  an IOU over the owl's face).
- If a prop is not instantly nameable at 0.5 scale, show it at scale 1 when it is the point of the shot.

## price
"The green path has no axes or labels to explain what it represents" (clarity 3/10 for the falling-price shot),
and the shot opens with a small ticket and arrow in a large empty frame.
- Make it unmistakably a PRICE: draw minimal pixel chart axes (a thick L-shaped axis in PAL.grey3 with a big
  ink-on-paper "$" plate at the top of the vertical axis), start with the first segment of the line already
  drawn and the item sitting on it within 0.2 s, and attach a small price tag (priceTag item at 0.5 or a
  paper "$" tag) to the riding item so "this thing's price" is obvious. Rising = red, falling = green, with a
  chunky arrowhead. The actor's reaction must explain the meaning: gain → smug/celebrate; loss → sweat/shock.
- Fill the stage: the line should end large and the last second must keep moving (the head of the line
  keeps creeping, the actor keeps reacting, the bar keeps pulsing).

## queue
"The lead changes from a tan hedgehog to a gray spiny animal, then a brown hedgehog with a headband, then a
fox — unclear whether these are separate traders or one character changing" (clarity 5/10), and the price
line was a small squiggle.
- Show them as a QUEUE: all 2–3 buyers visible at once from the first frame, standing in a line toward the
  counter with small gaps (full size; overlap in depth slightly if needed but every face visible), shuffling
  forward one place after each purchase; the buyer who has bought walks off with the item held at the paw.
- The price line/arrow: big, thick, on the free side or above the booth, one bold step per purchase.

## demand, runto
"The brown box and its 'DEBT' lettering" — the empty wallet was not recognised.
- In demand (outcome empty): the responder holds the wallet at scale 1, opens it toward the viewer (clearly
  a bifold wallet with an empty dark pocket), turns it upside down and shakes it; one or two tiny moths or
  dust puffs may flutter out; no reliance on reading "EMPTY". The speech bubble with the wanted item stays.
- In runto: the carried wallet is optional clutter — default `carry` to 'none' unless given; keep the run
  readable; the pale effect at the counter must not hide the paws.

## squeeze
"The ring and crossed bars need guessing"; frames 63–65 nearly static; the two victims overlap into a blur.
- Remove the gold ring effect; make the vise read as a vise (two thick jaws clearly closing from left and
  right or top and bottom, screw + handle that visibly turns on each ratchet step).
- Victims: at most two visible at once, side by side without overlapping faces, clearly squashed more at each
  step (flattened, wide eyes, sweat drops); a third victim, if given, appears in a later step replacing one.
- End: keep trembling + sweat + the stamp gently pulsing until the last frame.

## rush
One rabbit's ticket still partly covers its face — put items at the paw below the chin; check every frame.

## news
The poster art "three stylised human figures… exact activity unclear": that is a prop limitation; in the shot
make sure the actor never overlaps the poster and reacts clearly; keep the word plate large.

## store, wait, trade, loop, present, stamp and the rest
Only the general findings (dead holds at the end, edges, faces).
