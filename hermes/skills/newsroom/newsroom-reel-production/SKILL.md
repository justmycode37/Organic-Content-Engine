---
name: newsroom-reel-production
description: "Turn a verified AI news story into a finished, QA-checked Frontier Feed Instagram Reel (script, storyboard, studio spec, render, cover, caption) and hand it to publishing."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [newsroom, reels, video, script, production]
    category: newsroom
    requires_toolsets: [terminal, file, vision]
---

# Frontier Feed reel production

## When to use

After `newsroom-news-radar` has chosen a story and written `brief.md`. Ends with a rendered `reel.mp4`, `reel.cover.jpg` and `caption.txt` that passed QA, ready for `newsroom-publish`.

## Procedure

1. **Brief.** Write `runs/<run>/brief.md`: the story in two sentences, the angle sentence, 3–7 verified facts each with its source URL, the experiment variable for this run (from the playbook's experiments queue), the target length.

2. **Hooks.** Ask 2–3 subagents in parallel for hook variants (each gets the brief and the playbook's format rules). You need ≥ 8 candidates covering different styles: bold claim, consequence for the viewer, "watch this", contrast/number. Each hook = on-screen text (≤ 7 words) + first spoken line (≤ 2 s) + what is on screen in frame 1. Pick the best one yourself; the hook must be paid off by the video.

3. **Script.** Write the narration beat by beat in `script.md`:
   - Beat 1 (0–2 s): hook. Beat 2: context in one sentence. Beats 3–n: the payoff, one idea per beat, a visual change every 2–3 s. Last beat: the takeaway or a specific question.
   - Spoken English, short sentences, numbers read naturally ("about two million", not "1,987,340").
   - 25–40 s for news, 40–60 s for demos and explainers (~2.6 spoken words per second).
   - Every factual sentence must map to a fact in the brief.

4. **Critique before rendering.** Give the script to a fresh subagent acting as a harsh retention editor: where would a viewer swipe away, what is unclear, which claim is unsupported, is the hook paid off. Apply what is right.

5. **Visuals.** Gather assets into `runs/<run>/assets/`: official images and press-kit material, screenshots of the primary source, your own screen recordings via the browser tool, short excerpts of official demo footage (credited, a few seconds, always with commentary over it). Note the source of every asset in `brief.md`. Do not use footage you cannot trace to its origin.

6. **Spec.** Run `../studio/bin/studio templates` and read `../studio/README.md` for the current templates and spec format. Write `spec.json`: set `"brand": {"handle": "@<profile>"}` with the live handle from `python3 bin/postiz.py integrations` (field `profile`); one scene per beat, the hook scene first with `"cover": true` if it makes the best thumbnail, source labels on screen. Run `../studio/bin/studio validate runs/<run>/spec.json` until it passes.

7. **Render and QA.**
   - `../studio/bin/studio render runs/<run>/spec.json -o runs/<run>/reel.mp4`
   - `../studio/bin/studio qa runs/<run>/reel.mp4` must pass (resolution, fps, codec, loudness, duration).
   - Look at `reel.contact.jpg` and the cover with the vision tool: is the hook readable on a phone at a glance, does text stay out of the bottom 20% / right edge, are captions in sync, does anything look broken or cheap? Fix and re-render. Two QA rounds are normal.

8. **Caption.** Write `caption.txt` following the playbook's caption rules: line 1 restates the hook, 2–4 short lines of substance, "Source: …" line, one specific question, 3–5 specific hashtags. Max 2200 characters, aim for 300–700.

9. **Hand off** to `newsroom-publish`.

## Improving the studio

If a template limits you (looks dated, missing layout, weak motion), improve it in `../studio/templates/` or add a new one, document it in `../studio/README.md`, and re-render. Keep changes backwards compatible with older specs. Record what you changed and why in the run's `report.md`.

## Pitfalls

- Slow openings kill reach. No intro, no logo sting, no "Hey guys".
- Walls of text. On-screen text is ≤ 7 words per beat; the voice carries the detail.
- Unlabelled speculation. If it is a rumour, the screen says "Unconfirmed".
- Do not reuse the same template sequence every day; vary layouts so the feed does not look templated.

## Verification

`reel.mp4` passed `studio qa`; the contact sheet was reviewed with vision; `caption.txt` ≤ 2200 characters; every claim in the narration is traceable to a URL in `brief.md`.
