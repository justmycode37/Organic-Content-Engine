# CLEAN round brief (v5) — read fully before touching anything

Owner feedback on the last reel (verbatim gist): "Way too complex to consume. Quality is the problem:
it's always stuttery, and the pixel art is not clean enough — the viewer shouldn't have to guess what is
on screen. Objects must be recognizable and clear. Black background is fine. Make Hedgy less fat.
Sound effects and pace are very good."

So: KEEP narration, timing, pace, sound design. REPLACE the look and the motion quality.
This brief OVERRIDES `docs/shot-bible.md` wherever they conflict (the "never a void", "always-moving
camera", dither/fog/grain, "snap to pixel grid" rules are all revoked).

Repo: `chatgpt-site/` (nested git repo, branch `motion-v3`). Never git checkout/stash/reset/commit —
other agents edit the same tree concurrently; the lead commits. Edit ONLY files you own (your task says
which). Deterministic: no Math.random/Date. Canvas 1080x1920, 30 fps; animation area x 0–1080, y 0–1290;
captions (drawn by the player) live below y 1320 — never draw there.

## 1. Instant recognizability (the #1 rule)

A stranger shown ANY single frame for half a second, with captions hidden, must be able to name every
object on screen ("a hedgehog handing a concert ticket to a man", "a safe with cash in it").
- Max 3 things on screen (Hedgy counts). One of them is the hero and is BIG: its smaller side >= 300 px.
  Supporting objects >= 180 px. People >= 320 px tall.
- Background: flat near-black `#0B0B0D`. Nothing else, except optionally ONE soft ground shadow ellipse
  under standing objects and at most one thin floor line. No architecture, grids, wireframes, balconies,
  rails, fog, particles clouds, crowds of tiny figures, HUD ticks, scanlines, grain, dither, bloom,
  reflections. Empty black space is GOOD — it is what makes the objects read.
- Objects are iconic, front/three-quarter "emoji-clear" views with the features that identify them
  exaggerated (a banknote has a big $ and a portrait oval; a safe has a round door, a dial and a handle;
  a ticket has perforation, a notch and ADMIT ONE; a clock has 12 ticks and two hands).
- Value contrast: objects are LIGHT on the dark stage (body in the #C9C9CE–#F5F5F6 range, 3–4 flat tones:
  highlight, base, shade, dark outline `#0B0B0D`/`#2A2A31` inner lines). Never mid-grey on dark-grey.
  Clean 1-art-pixel dark inner lines; a 1-art-pixel lighter rim is fine. No dithering, no noise textures.
- Palette: black/white/greys; Hedgy natural browns; RED `#FF3B30` only for price rising / losses,
  GREEN `#30D158` only for price falling in his favour / gains. No other hues.
- Words: allowed and encouraged when they remove doubt — a short label that is part of an object
  (sign, stamp, tag: LENDER, BROKER, SOLD OUT, IOU, BUY). Big (cap height >= 40 px), heavy sans
  (`'Anton','Impact','Arial Black',sans-serif` weight 900) or large pixel type, max 2 labels on screen.
- Uniform pixel size: every sprite uses ART = 6 device px per art pixel (`src/motion/kit/sprite.ts`).
  Never mix pixel densities in one frame; never scale a sprite to a non-1 scale for more than a brief
  pop/squash (<= 0.3 s) — if something must be bigger, author it bigger.

## 2. Smooth motion (the #2 rule)

"Stuttery" came from: positions snapped to 4 px grids, quantized camera shake, per-frame grain/dither
that swims, 3D voxel rasters whose cells crawl while the camera moves, non-integer nearest-neighbour
scaling, hard pose swaps, strobing flashes and very fast whips at 30 fps.
- All positions are floats — NEVER round/snap animated coordinates. Draw sprites with
  `drawSprite` (smoothing on, pre-upscaled) so motion is sub-pixel smooth.
- Every move is eased (cubic/quint in-out, springs with a small overshoot, arcs). Anticipation →
  action → settle. No teleports, no linear robotic slides, no 1–2 frame jumps.
- Max on-screen speed for something the viewer must read: ~1800 px/s (60 px/frame). Faster only for
  exits/entrances, and then give it a stretched smear (elongate along motion) for those frames.
- No camera shake, no handheld drift, no whip pans, no strobing/flash frames, no impact-frame inversion.
  Camera: static, or one slow eased push/pan (<= 8% zoom per shot). Impacts are sold by the OBJECT:
  squash & stretch, a small bounce, 4–8 clean chunky debris/spark pixels that ease out, a ring that
  expands once.
- Pose changes of characters blend (in-between frame or squash through the change), never a hard swap.
- Nothing flickers. No per-frame noise. Idle life = slow breathing / bob (period >= 1.2 s).
- Each shot still changes meaningfully every 0.4–0.7 s (pace stays fast) — through clear staged actions,
  not through clutter. One action at a time; the eye must always know where to look.
- 3D (`three.ts`) is allowed ONLY for a single hero object whose shape stays instantly readable while it
  turns, lit flat (3–4 tones, outline), with the engine's smooth mode (no cell crawl). When in doubt use
  2D sprites.

## 3. Layout

- Compose for 9:16 inside x 60–1020, y 90–1230. Keep 40 px gaps between objects unless they touch on
  purpose (holding, handing over). Nothing covers Hedgy's face. Nothing is cropped by the frame edge
  except during an entrance/exit move.
- Use the height: stage actions on a vertical or diagonal axis, big.
- Hedgy stands with feet around y 1080–1180, height ~330–420 px (see actor docs).

## 4. Shared building blocks (v5)

- `src/motion/kit/sprite.ts` — `ART`, `makeSprite`, `spriteFromRows`, `drawSprite` (exists now).
- `src/motion/kit/motion.ts` — easing, spring, arc, anticipation, squash/stretch, smear helpers (kit agent).
- `src/motion/kit/stage.ts` — `drawStage` (background, floor line, soft shadow), labels/signs, arrows,
  price line, clean debris/ring effects, layout guards (kit agent).
- `src/motion/props/*.ts` — the clean prop library; every prop is
  `drawX(ctx, { x, y, size?, t?, ...state })` drawing with `drawSprite` at float coords (prop agents).
- `src/motion/actor/hedgy.ts` — `drawHedgy` (slimmer redesign, same API).
- Gallery: `node scripts/prop-gallery.mjs out.png` renders every prop/pose on the black stage for a
  recognizability check.

## 5. The film (unchanged narration; timings in `docs/showcase-timed-spec.json`)

Shot starts (s): 1 0.00 · 2 2.37 · 3 6.20 · 4 8.77 · 5 11.23 · 6 12.97 · 7 14.93 · 8 16.90 · 9 19.03 ·
10 20.87 · 11 22.60 · 12 23.90 · 13 26.60 · 14 29.27 · end 32.67.

| # | shot | narration | what we SEE (clean staging) |
|---|---|---|---|
| 1 | borrowedasset | Hedgy sells a concert ticket that isn't his. | Hedgy holds a big concert ticket; a BORROWED tag hangs on it; he hands it to a buyer (person) who gives a banknote. |
| 2 | shortsalehandoff | That's short selling: he borrows it, sells it, and owes the lender a ticket back. | Three clear beats left→right: LENDER person gives ticket to Hedgy (borrows) → Hedgy passes ticket to BUYER, cash comes back (sells) → an IOU slip with a ticket outline appears between Hedgy and LENDER (owes). |
| 3 | pricestair | He bets prices will fall, so he can buy it back cheaper. | A big ticket with a price tag; a candlestick chart trends DOWN; price tag shrinks from big coin stack to small coin stack; Hedgy smug. |
| 4 | vaultlock | His broker holds the sale money as collateral | BROKER person + big safe; the cash bundle goes into the safe; door closes, dial turns, padlock. |
| 5 | waitclock | while he waits. | Big clock, hands sweep; Hedgy taps his foot, IOU in paw. |
| 6 | announcement | Then the band announces a reunion | A big poster / megaphone: band (3 simple musicians) + REUNION; Hedgy shocked. |
| 7 | crowdrush | and fans rush for the last tickets. | Ticket booth with a short stack of tickets; 3 big fans run in, tickets go 3 → 2 → 1 → SOLD OUT. |
| 8 | priceride | The price jumps and Hedgy's losses grow, | Ticket price tag rides the latest close of a candlestick chart trending UP; Hedgy looks up worried, a red loss bar under him grows. |
| 9 | collateralcall | so the broker demands more collateral. | BROKER holds out an open hand / points at the safe (now showing a "MORE" slot); Hedgy turns out an EMPTY wallet. |
| 10 | forcedbuyback | He can't pay, so he must | Empty wallet flaps; Hedgy runs toward a BUY booth. |
| 11 | buybackhandoff | buy a ticket back now. | Hedgy pays a tall pile of cash for ONE ticket (expensive) and it goes back to LENDER. |
| 12 | minimarket | Those forced buys add demand and push prices higher, | Buyers queue at the booth; each buy reveals another rising candle in the price chart. |
| 13 | demandfeedback | scaring other short sellers into buying back too. | 2–3 other "short seller" characters (hedgehog-like silhouettes or people with IOU slips) panic and run to the booth one by one; each reveals another rising candle → a visible loop arrow. |
| 14 | squeezerocket | That loop is a short squeeze. | The loop arrow tightens around the ticket price which rockets up; the short sellers get squeezed between rising price and the top; stamp SHORT SQUEEZE; ends matching the first frame of shot 1 for the loop. |

Shot authors may restage details, but must keep: the narration sync events (`props.events`, kinds = sync
words), the same `cues(props, dur)` density and physical kinds (sound was approved — keep the cue list
roughly as it is, retimed to your new actions), the shot names, and recurring characters looking
identical in every shot (LENDER, BROKER, BUYER/FAN, ticket, cash, IOU, booth all come from `props/`).

## 6. Verify

`cd chatgpt-site && node scripts/motion.mjs shot ../docs/showcase-timed-spec.json out.png <t...>` (stills at
reel times) and `node scripts/motion.mjs render <spec> out.mp4` (silent). Look at frames at full size and
at consecutive frames (t, t+1/30, t+2/30...) to check smoothness. Typecheck `npx tsc -p tsconfig.json
--noEmit`; tests `node --test scripts/motion.test.mjs scripts/hedgy.test.mjs`. Put scratch output in a
temp dir, not in the repo.

## 7. GENERAL library, not a one-off (owner instruction)

Everything built in this round is for EVERY Hedgy video (any explanatory finance/markets topic), not just
the short-squeeze showcase. So: props, people, kit and shots take parameters (labels, counts, who gives
what to whom, direction up/down, which prop) instead of hard-coding this story; nothing in a prop or kit
file may mention the squeeze. The showcase reel is just one spec composed from the general pieces.
Hedgy himself (`src/motion/actor/hedgy.ts`) is drawn by the lead: semi-realistic slim hedgehog, ~320 px
tall at scale 1, feet at (x, y); poses idle walk run jump shock celebrate point think push carry fall curl
roll peek sweat sleep wave-off give receive hold smug lookup tap empty panic squeezed; use
`hedgyAt(t, [{at, pose}])` for blended pose timelines, `hedgyPaw(o)` to attach props, `handTarget` to reach.

## 8. ROUND 2 CORRECTIONS (override anything above that conflicts)

The first prop pass was recognisable-ish but flat grey and not at Hedgy's level. Owner: "clean and
recognizable but STILL PIXEL ART."
- COLOUR IS NOW ALLOWED AND WANTED, from the house palette only: `PAL` in `src/motion/kit/pixel.ts`
  (muted natural families: paper/cream, greys, gold, green, red, blue, wood/leather browns, pink, orange).
  Objects take their real-world colour family because that is what makes them recognisable in half a
  second: gold coins, green banknotes with a big $, brown leather wallet, steel-blue safe, red/white
  striped awning, cream paper tickets and documents, pink piggy bank, red apple... 3–4 tones per object
  (light, base, shade) + `PAL.ink` outline. Greys only for things that are really grey (metal, stone).
  `PAL.UP` (#FF3B30) / `PAL.DOWN` (#30D158) stay reserved for price direction / loss / gain.
  Background stays flat #0B0B0D.
- EVERYTHING IS PIXEL ART on the ART = 6 px grid: no smooth vector strokes, no anti-aliased canvas
  text/lines/arcs in the picture. Lines, arrows, charts, labels, bubbles, shadows, effects are rasterised
  on the art grid (use `Grid` from kit/pixel.ts → cached sprite → `drawSprite`). Text inside the picture
  is chunky pixel lettering (a heavy, wide pixel font with cap height >= 9 art px = 54 px, 2-art-px
  strokes), always fully legible, never overlapped by a stamp or another shape.
- Draw with `Grid` (kit/pixel.ts): `fill/rect/ellipse/round/poly/line/rows_/shade/outline/sprite`. Shapes
  are tested at cell centres, so edges are clean stair-steps; finish with `outline()`. Reference for the
  quality bar and technique: `src/motion/actor/hedgy.ts` (render it: scratch spec with
  `{"type":"shot","shot":"demo-hedgy","duration":4,"params":{"pose":"idle","scale":2}}`).
- Quality bar per prop: big simple masses first, then 2–4 identifying details, a light side (top-left) and
  a shade side, no speckle/noise/dither, no hairline 1-px clutter, no tiny unreadable text. If a detail
  is smaller than 2 art px it does not exist. Fewer, bolder shapes.
- Moving parts: separate sprites with float transforms; rotation of a pixel sprite is fine for motion,
  but resting states should sit at 0° / integer positions so the pixels look crisp.
- Price charts are always candlestick charts. Candle bodies use market colours: green when the close is
  above the open, red when the close is below the open; Hedgy's reaction and the LOSS/GAIN bar show
  whether the move is good or bad for him.
