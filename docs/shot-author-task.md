Repo: "/Users/benajaheger/Documents/museum of failures/Organic Content Engine" (quote the path; it has spaces). App in chatgpt-site/. You are a SHOT AUTHOR for the general Hedgy reel library (explanatory finance Reels for Instagram: clean, colourful pixel-art animals and objects on a flat black stage, smooth motion, instantly readable).

Read, in this order and completely: docs/clean-brief.md (section 8 overrides earlier sections), docs/shot-library.md (your contract: stage, actors, items, animation rules, cue rules, verification), docs/clean-kit.md, chatgpt-site/src/motion/shots/common.ts, chatgpt-site/src/motion/shots/handoff.ts (the REFERENCE shot — render it first to see the look: params {"from":"lender","to":"hedgy","item":"ticket","back":"cash","fromLabel":"lender","tag":"borrowed"}), and the prop files you will use under chatgpt-site/src/motion/props/ for their state options. See all props: `cd chatgpt-site && node scripts/prop-gallery.mjs <out.png>`.

YOUR SHOTS are named in your task message (see the table in docs/shot-library.md for each idea and its key params).

Each is one file chatgpt-site/src/motion/shots/<name>.ts exporting a ShotDef with `stage: 'clean'`, a precise one-line `describe` (what it shows; params with allowed values/defaults; what each event does) and registered in shots/index.ts via two tiny exact-string edits (one import, one SHOTS entry — never rewrite that file; eight other agents edit it concurrently; re-read it right before editing). You own ONLY your shot files. Do not edit props, kit, actor, common.ts or other shots; if a prop lacks an option you need, work around it in your shot (compose with other items/labels) and mention it in your report. Never git checkout/stash/reset/commit. Scratch files go outside the repo.

Requirements beyond docs/shot-library.md:
- GENERAL: every actor, item and word is a param with a sensible default; at least 3 very different param sets must look good (e.g. a ticket story, a stock/share story, an everyday analogy with apples or pizza). No story-specific logic.
- CLEAR: max 3 big things; a stranger looking at any frame with captions hidden names everything and says what is happening. Use the vertical space of the 720 × 860 stage; nothing clipped; faces never covered.
- SMOOTH and ALIVE: eased float motion, anticipation/settle, squash on impacts, pose timelines that blend, actors look at the action; something meaningful every 0.4–0.7 s; no dead holds, no flashes, no shake.
- SOUND: 4–8 cues per shot matching visible actions, mostly dull/deep kinds (thump, knock, whump, clunk, footfall, slide, rustle, creak, sub, thud, land, paper, stamp) with a few bright accents (coin, ding, pop, sparkle).
- Works for durations 1.5–5 s and with 0, 1, 2 or more events.

Verify exactly as docs/shot-library.md says (stills, silent mp4, stutter-check, 12 consecutive frames around each action, odd durations, no events), LOOK at the images critically, and iterate at least 4 rounds. Final report: for each shot — describe line, params with defaults, three example param sets you verified, known limitations, and paths to your final contact sheets.
