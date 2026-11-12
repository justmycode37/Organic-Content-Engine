# Motion v4 — make Hedgy reels readable, acted-out and smooth (shared contract)

Repo: `chatgpt-site/` in the Organic Content Engine checkout (branch `main`, shared working tree).
Read first: `docs/motion-v3.md` (tools, look, determinism, file-ownership rules), `docs/shot-bible.md`,
`chatgpt-site/src/motion/README.md`, `chatgpt-site/worker/hedgy-policy.ts`.

## Why this round exists (owner verdict on the latest autopilot reels: "complete shit")

Owner review of five generated reels (see frames in `artifacts/hedgy/autopilot-v2-2026-11-12-r*/finished.mp4`):

- **Animations do not act out the narration.** Most shots are "actor stands left, object sits right" for
  2–3 s while the voice tells a story. "Someone joins your pizza order" showed Hedgy alone with a pizza.
  "Badger keeps shaving the snowball" showed a badger standing next to a ball that slowly shrinks.
- **Stray / buggy elements**: the `grow` shot's `timer:'clock'` puts a big alarm clock above the action
  for the whole shot; stamp words are clipped at the frame edge; slices of a pizza render as red gems;
  the snowball reads as an egg; the poster prop shows a concert "SHOW" design in a lemonade story;
  shots pop/teleport between states instead of moving.
- **Monotony**: the generator reused one shot up to 11 times; every frame is the same side-by-side layout.
- **Hard to consume**: the viewer cannot tell what is happening without reading captions.

## The bar (every shot, every parameter combination)

1. **A stranger watching with sound off and captions hidden can say what HAPPENS** (a verb, not just
   what is there): "the badger scrapes a chunk off the snowball and pockets it", "a mouse walks in and
   takes one slice of the pizza". If it is only a pose next to an object, it fails.
2. **Continuous, readable action across the whole shot**: anticipation → action → result → settle, with
   eased motion; something meaningful moves every 0.4–0.8 s; no frozen holds > 0.8 s, no teleports, no
   popping in/out (fade/scale/slide everything that appears or leaves).
3. **Cause and effect is visible**: the object visibly changes because of an actor (pieces move from one
   character to another, things get smaller/bigger/locked/broken), and the result stays on screen long
   enough to register (~0.5 s).
4. **Instantly recognisable props** at reel scale: real-world colour and silhouette (a pizza slice is a
   triangle with crust and pepperoni; a snowball is white/blue-white with snow texture and a little snow
   trail; a car is a car). Clean pixel art, max 3 big things per shot, flat dark stage.
5. **Nothing irrelevant on screen.** Optional extras (timers, signs, labels) only when the params ask for
   them, small and never above the main action for the whole shot. Short sign words only.
6. **Safe framing**: everything inside x 40–1040, y 60–1280 (captions own y ≥ 1320). No clipping of words,
   actors or props, at any `frame.t` (also slightly negative or > dur during transitions).
7. **Composition variety**: shots should not all be "actor left, prop right". Use the stage: actors
   entering from the side, two actors facing each other with the item between, close-ups on the item when
   it changes, objects moving across the frame. Keep one consistent character scale per shot.
8. Deterministic (no Math.random/Date), fast (< 60 ms/frame), works for ANY actor id and ANY item id.

## Tools

```
cd chatgpt-site
node scripts/motion.mjs shot <spec.json> <out.png> <t> [t...]   # stills at several times
node scripts/motion.mjs render <spec.json> <out.mp4>             # silent video (no API cost)
node scripts/review-reel.mjs <out.mp4> <dir> 6                   # contact sheets + motion.txt (dead holds)
node scripts/prop-gallery.mjs <out.png> [filter] --t 0,0.5,1     # prop sheet
node scripts/build-shot-catalog.mjs                              # after changing a shot's name/describe/items
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.render.json --noEmit
node --test scripts/motion.test.mjs scripts/hedgy.test.mjs
```

Never call `motion-audio.mjs` (it spends ElevenLabs credits) — the lead renders with sound.
Scratch files go in `$TMPDIR/motion-v4/<your-area>/`. LOOK at your stills/contact sheets and iterate.
Test every shot with at least three different item ids and two different actor pairs.

## Ownership (edit ONLY your files; shared files only by small exact-string edits)

| Agent | Files |
|---|---|
| shots-A | `shots/present.ts`, `shots/grow.ts`, `shots/wait.ts`, `shots/stamp.ts`, `shots/handoff.ts` |
| shots-B | `shots/split.ts`, `shots/store.ts`, `shots/runto.ts`, `shots/trade.ts`, `shots/protect.ts` |
| shots-C | `shots/compare.ts`, `shots/demand.ts`, `shots/price.ts`, `shots/queue.ts`, `shots/rush.ts`, `shots/news.ts` |
| shots-D | `shots/balance.ts`, `shots/equation.ts`, `shots/loop.ts`, `shots/squeeze.ts` |
| props | `src/motion/props/*`, `src/motion/assets/*`, the `ITEMS` table in `shots/common.ts` |
| new-shots | new files `shots/take.ts`, `shots/arrive.ts`, `shots/lockaway.ts`, `shots/reveal.ts`, `shots/breaks.ts` + registry lines in `shots/index.ts` |
| lead (Claude) | `worker/*`, `scripts/motion-audio.mjs`, `scripts/audio/*`, generation prompts, final renders |

Keep each shot's `name`, existing params and event semantics working (old specs must still render);
you may add params. Update the `describe` line so it says exactly what the viewer SEES happen, which
params exist, and what each event does — the generator picks shots only from these lines. Then run
`node scripts/build-shot-catalog.mjs`. Never `git checkout/stash/reset/commit`; other agents edit the
same tree. If a typecheck error is in someone else's file, ignore it.

## Report back

A short list: what you changed per file, before/after still paths, remaining known issues.
