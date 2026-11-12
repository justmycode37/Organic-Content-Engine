# The general Hedgy shot library (v5 "clean")

Read first: `docs/clean-brief.md` (all of it; section 8 wins on conflicts), `docs/clean-kit.md`, then the code:
`chatgpt-site/src/motion/shots/common.ts` (stage, actors, items, beats, cues) and the REFERENCE shot
`chatgpt-site/src/motion/shots/handoff.ts`. Copy its structure.

## What a shot is

A shot is a small, GENERAL, parameter-driven scene (2–4 s) that explains ONE idea with at most 3 big things
on a flat black stage. It must work for any finance topic: actors and items come from `params`, words on
signs come from `params`, and the animation plays on the narration events IN ORDER (`beats(props, dur,
[fallback fractions])` — never on named event kinds). Nothing may mention a specific story.

```ts
export const myShot: ShotDef = { name: 'myshot', stage: 'clean', describe: '…what it shows; params: …; Events: 1 = …, 2 = …', render(frame, props) {…}, cues(props, dur) {…} };
```
Register it in `src/motion/shots/index.ts` with two small exact-string edits (one import line, one entry in
`SHOTS`) — never rewrite that file; other agents edit it at the same time.

## Stage (`stage: 'clean'`)

- You draw on a 720 × 860 stage; the player zooms it ×1.5 to fill the 1080 × 1290 animation area, so one art
  pixel = 9 device px. Hedgy ≈ 320 tall, a ticket 420 wide, a booth 564 × 720, a safe 528 × 564: things
  are BIG — compose with 2–3 of them, overlapping depth is fine if nothing important is hidden.
- `STAGE = { w: 720, h: 860, floor: 770, left: 150, right: 570, centre: 360, top: 70 }`. Actors stand on
  `STAGE.floor`. Keep important content inside x 24–696, y 24–836. Name plates/labels may sit under the
  floor line (y ≈ 822).
- `drawStage(ctx, { floorY: STAGE.floor, line: true })` first. Flat black. No backgrounds, no decoration.
- Actors: `drawActor(ctx, { who, x, y, facing, time: t, keys: [{ at, pose, expression? }], handTarget, reach, look })`
  where `who` is `'hedgy'`, a role (`broker`, `banker`, `lender`, `buyer`, `trader`, `rival`, `clerk`,
  `saver`, `fan1..3`, `customer`, `seller1`, `seller2`, `investor`) or a species (`fox`, `badger`, `owl`,
  `raccoon`, `rabbit`, `rabbit2`, `rabbit3`, `mouse`, `hedgehog`, `hedgehog2`). Poses: idle walk run jump
  shock celebrate point think push carry fall curl roll peek sweat sleep wave-off give receive hold smug
  lookup tap empty panic squeezed. Pose timelines blend automatically. `actorPaw(o)` gives the paw
  position; `handTarget` + `reach` (0..1, eased) makes the paw reach a point.
- Items: `drawItem(ctx, id, { x, y, t, scale, rot, sx, sy, ...state })` draws ANY prop centred at (x, y):
  ids in `ITEMS` (ticket, banknote, cash, cashPile, coin, coinStack, priceTag, iou, wallet, safe, padlock,
  clock, hourglass, booth, poster, megaphone, press, share, contract, bond, piggy, moneyBag, gold, card,
  calculator, percent, pie, barChart, candles, basket, umbrella, shield, lever, magnifier, calendar, dice,
  crypto, bank, exchange, house, factory, shop, taxOffice, bull, bear, crate, warning, check, cross,
  question, apple, appleCrate, lemonade, pizza, car, phone, cart, gift, key, bulb, weather, tree,
  snowball). Extra keys are prop state — read the prop file for its options (e.g. booth `sign`, `shutter`,
  `stock`; safe `door`, `dial`, `contents`; wallet `open`, `empty`; ticket `tag`, `stamp`; poster `word`,
  `art`, `reveal`). Use `scale: 1` for hero objects and exactly `0.5` for carried/secondary ones.
  `itemParam(params, 'item', 'ticket')` reads an item id from params with a default.
- Kit: `label` (sign/tag/stamp/bubble pixel plates), `arrow`, `loopArrow`, `priceLine` (thick pixel line,
  red up / green down), `bar`, `connector`, fx `ring` `sparks` `poof` `speedLines`, motion `tween` `track`
  `arc` `spring` `squash` `bob` `phase` `ease`.

## Animation rules (the owner complained about stutter and clutter)

- Floats everywhere, eased everything, anticipation → action → settle, squash on impacts. No shake, no
  flashes, no camera moves except one slow eased zoom/pan of the whole stage ≤ 6% if it helps.
- One action at a time; something meaningful starts every 0.4–0.7 s; never a dead hold > 0.6 s (idle
  breathing/bob does not count as action) and never end on a freeze — the last frames still move.
- Entrances/exits: things pop in with `ease.outBack`, slide in from an edge, or are already there. Fast
  moves (> 40 stage px/frame) get a stretched smear along the motion.
- Hedgy/actors ACT: pose changes on every beat, look at what matters, reach for things.
- Readable with the sound off and the captions hidden: a stranger names every object and says what just
  happened.
- Cues (`cues(props, dur)`): same beat maths as render. 4–8 cues per shot now (the owner wants MORE sound):
  every visible action gets one. Prefer DULL/DEEP kinds for bodies and heavy things — `thump`, `knock`,
  `whump`, `clunk`, `footfall`, `slide`, `rustle`, `creak`, `sub`, `thud`, `land`, `paper`, `stamp` — and use
  bright kinds (`coin`, `coins`, `ding`, `sparkle`, `glass`, `pop`) only as accents. Main hit gain 1.3–1.6,
  secondary 0.5–0.9. `cue(t, kind, gain, x)` pans from the stage x (use device-independent stage x * 1.5
  is NOT needed — pass `x * 1.5` only if you want exact pan; plain stage x is fine).

## The shots

| shot | idea | key params |
|---|---|---|
| handoff (done) | A gives an item to B; optional return item | from, to, item, back, fromLabel, toLabel, tag |
| present | an actor shows a hero item with a tag/label (hooks, definitions) | who, item, tag, label, mood |
| stamp | a big word is stamped onto/under a hero item or the scene (naming the concept; end cards) | item, word, who, mood |
| price | the price of an item moves: big pixel price line up or down with the item riding it; actor reacts; optional loss/gain bar | item, dir, steps, who, mood, bar |
| compare | two things side by side: cheap vs expensive, before vs after, A vs B | left, right, leftLabel, rightLabel, winner, who |
| store | an item goes into a container (safe, piggy, bank, wallet, crate) which shuts/locks | item, container, who, label |
| wait | time passes: clock / hourglass / calendar races while an actor waits | timer, who, mood, label |
| news | an announcement lands: poster unrolls / megaphone blasts / phone lights with a word; actor reacts | medium, word, art, who, mood |
| rush | several actors run to a booth/building; its stock counts down; sign flips (SOLD OUT) | crowd, place, sign, endSign, stock, who |
| demand | actor A demands something from B (open palm); B turns out an empty wallet or hands it over | from, to, want, outcome |
| runto | an actor runs urgently to a place (booth, bank, exchange) | who, place, sign, mood |
| trade | at a booth: an actor pays (cash pile size = price) and receives an item | who, place, sign, item, price (low/high), clerk |
| queue | buyers queue at a place; each purchase bumps the price a step | crowd, place, sign, dir, steps, item |
| loop | feedback loop: 3–4 items/labels around a pixel loop arrow light up in turn, faster each lap | nodes [{item,label}], speedup, who |
| squeeze | a vise closes on an item or on actors; pressure builds; optional word stamp | victim (item or actors), word, who |
| grow | compounding: something grows step by step while calendar pages flip | item (tree/snowball/coinStack/piggy), steps, who |
| split | one thing splits into several (diversification, shares of a company) | item (pie/pizza/basket), parts, who |
| protect | an umbrella/shield guards an item or actor from a storm of losses | guard, who, item |
| balance | a lever/scale tips: leverage, risk vs reward, supply vs demand | left, right, tilt, who, labels |
| equation | A + B = C with big item chips | a, b, c, op, labels |

## Verify (mandatory, like an art director)

Scratch spec (outside the repo) with your shots, several param sets each (at least 3 different
item/actor combinations — prove it is general):
`{"version":1,"title":"s","series":"HEDGY / FINANCE","mode":"dark","accent":"mono","music":"none","scenes":[{"type":"shot","shot":"<name>","duration":3,"params":{…},"events":[{"at":1.1,"kind":"a"},{"at":2.1,"kind":"b"}]}]}`
- stills: `cd chatgpt-site && node scripts/motion.mjs shot spec.json out.png 0.2 0.8 1.2 1.6 2.4` — LOOK at them.
- motion: `node scripts/motion.mjs render spec.json out.mp4` then `node scripts/stutter-check.mjs out.mp4 <dir>`
  and extract 12 consecutive frames around each action (`ffmpeg -ss … -frames:v 12`) and LOOK: smooth arcs,
  no pops, no overlaps hiding faces, nothing clipped by the frame, labels fully legible.
- also test odd durations (1.6 s and 4.5 s) and with no `events` (fallback timing).
- typecheck `npx tsc -p tsconfig.json --noEmit` (fix only your files).
Iterate at least 4 rounds. The bar: a viewer instantly understands the idea, it feels alive and charming,
and it is as clean as the reference.

## REVIEW ROUND 1 — hard rules added after the first full cut (artifacts/hedgy/clean-v1.mp4, sheet clean-v1-sheet.png)

The first assembled reel showed shots that do not match each other. These are now mandatory:
1. UNIFORM SCALE. Every actor is drawn at `scale: 1` (never smaller, never a zoomed-out stage, no shot-level
   ctx.scale below 1). Hero items `scale: 1`; carried/secondary items exactly `0.5`. A shot that needs more room
   must use fewer things or let big props run partly off the stage edge — not shrink. Reference look:
   `handoff`, `store`, `wait` (characters ≈ 37% of the stage height).
2. FILL THE STAGE. The action uses the full 720 × 860 stage: main subject large and centred, floor at
   `STAGE.floor`. No tiny diagram floating in a corner.
3. LEGIBLE LABELS. Words are always dark `PAL.ink` pixel text on a light `PAL.paper` plate (kit `label`
   variants sign/tag/bubble) or red on paper for stamps. Never red/dark text on a dark box, never text
   smaller than the kit's heavy face, never a label cut by the frame or overlapped by an object.
4. FACES CLEAR. Nothing covers an actor's head — carried items sit at the paws (below the chin) or are
   held up beside/above the head with a gap.
5. EVERYTHING IN FRAME. Actors and hero props stay fully inside x 24–696 (entrances/exits excepted).
6. PRICE LINES are thick (kit `priceLine` width ≥ 30) and long — they should span most of the stage.
7. NO DEAD HOLDS: after the last beat keep purposeful motion (reaction acting, item bob, a second small
   action), and start the first action within 0.25 s.
8. No explanatory filler plates ("BIG NEWS JUST DROPPED", "STOCK 3" etc.) unless a param asks for a label.
   The picture explains; the narration and captions do the words.
The timed spec of the real reel is `docs/clean-timed-spec.json` (real durations and event times): render
stills from it with `node scripts/motion.mjs shot ../docs/clean-timed-spec.json out.png <reel times…>`.
