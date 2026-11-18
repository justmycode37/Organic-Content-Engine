# Newsroom Studio

Self-contained Instagram Reel renderer for the **Frontier Feed** AI-news channel
channel. An agent writes a JSON spec, `studio render` turns it into a
finished 1080x1920 / 30 fps MP4 with voiceover, word-level burned-in captions,
a cover image, a contact sheet for visual QA, an SRT file and a JSON report.

Scenes are HTML/CSS templates captured frame by frame in headless Chromium, so
anything you can design in a browser can become a scene.

```
studio/
  bin/studio            launcher (POSIX sh, runs the CLI inside .venv)
  setup.sh              idempotent setup: uv sync, fonts, Chromium check
  src/studio/           Python package (cli, spec, tts, media, render, capture, qa)
  templates/            scene templates (<name>.html) + _base.html/_base.css/_runtime.js
  themes/default.css    brand tokens: colors, accent, fonts, safe-area geometry
  assets/fonts/         OFL fonts (downloaded by setup.sh)
  examples/             example.json + placeholder image generator
  cache/                TTS audio, downloads, prepared media (gitignored)
  out/                  renders (gitignored)
```

## Setup

```sh
./setup.sh          # safe to re-run; prints resolved binaries as JSON
bin/studio doctor   # same check at any time
```

Binary resolution (no absolute paths in code; works on macOS and Linux):

| Tool | Order |
| --- | --- |
| uv | `$STUDIO_UV`, `../tools/uv-*/uv`, `PATH` |
| python (for uv) | `$UV_PYTHON`, `../tools/python-*/bin/python3`, uv's own discovery |
| ffmpeg / ffprobe | `$STUDIO_FFMPEG` / `$STUDIO_FFPROBE`, `../tools/ffmpeg-*/`, `PATH` |
| Chromium | `$STUDIO_CHROMIUM`, `../tools/chromium-*/` (platform executable), Playwright cache; otherwise setup runs `playwright install chromium` |

Other environment variables: `STUDIO_WORKERS` (parallel browsers, default
cpu/2 capped at 8), `STUDIO_CACHE_DIR`, `ELEVENLABS_API_KEY`.

## CLI

All commands print JSON on **stdout** and logs on **stderr**. Exit codes:
`0` ok, `1` error (invalid spec, render/tool failure), `2` usage error,
`3` QA failed. Nothing is ever interactive.

```sh
bin/studio validate SPEC.json                        # schema, templates, props, files, duration estimate
bin/studio render SPEC.json -o out/reel.mp4          # full render
bin/studio render SPEC.json -o out/draft.mp4 --preview   # 540x960 @ 15 fps draft, much faster
bin/studio render SPEC.json -o out/reel.mp4 --qa     # render and include `qa` results in the JSON
bin/studio still SPEC.json --scene 2 --t 1.0 -o out/s2.jpg  # one frame of one scene (design loop)
bin/studio qa out/reel.mp4                           # technical checks (format detected from the resolution)
bin/studio thumbnail -o out/thumb.jpg --text "No steering wheel" --highlight wheel --image bg.jpg
                                                     # 1280x720 YouTube thumbnail + 320x180 small preview
bin/studio templates                                 # templates + props contracts
bin/studio voices                                    # recommended voices
```

`render` writes, next to `OUT.mp4`:

| File | Content |
| --- | --- |
| `OUT.cover.jpg` | cover frame (scene with `"cover": true`, captions hidden) |
| `OUT.contact.jpg` | 12 evenly spaced frames with timestamps and scene names, for vision QA |
| `OUT.captions.srt` | caption chunks with global timings |
| `OUT.chapters.txt` | YouTube chapter list (`0:00 Intro` …), only when scenes have a `chapter` |
| `OUT.report.json` | format, duration, chapters, per-scene timings, loudness, voice, warnings, render time |

`render --keep-build` keeps `OUT.build/` (scene HTML pages and segments) for
debugging; open a scene page in a browser to inspect it.

`qa` checks (reel; long-form: 1920x1080, 24/25/30/60 fps, 120-1800 s): 1080x1920, 30 fps, H.264 (High) yuv420p, AAC 48 kHz, duration
15-90 s, integrated loudness -14 LUFS ±1.5, true peak, no silence > 1.5 s,
no black segment > 0.5 s, first frame not black, `+faststart`.

## Spec format

```json
{
  "title": "OpenAI ships GPT-6",
  "voice": {"provider": "edge", "voice": "en-US-AndrewMultilingualNeural", "rate": "+10%"},
  "theme": "default",
  "music": {"path": "music/bed.mp3", "volume": 0.12},
  "captions": {"enabled": true, "style": "karaoke", "max_words": 3},
  "scenes": [
    {
      "template": "hook",
      "narration": "OpenAI just made its best model free.",
      "props": {"headline": "GPT-6 is free", "highlight": "free", "kicker": "Breaking"},
      "media": "https://example.com/hero.jpg",
      "cover": true
    },
    {
      "template": "stat",
      "narration": "It scores eighty seven percent on the hardest coding benchmark.",
      "props": {"kicker": "SWE-bench", "value": "87%", "label": "of real GitHub issues solved"},
      "source": "OpenAI blog"
    },
    {"template": "outro", "narration": "Follow Frontier Feed for daily AI news.", "min_duration": 2.5}
  ]
}
```

A complete 8-scene example using every main template: `examples/example.json`.

### Top level

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | string | required | used in metadata and reports |
| `format` | `reel` \| `longform` | `reel` | `reel` = 1080x1920, 15-90 s, ≤ 40 scenes; `longform` = 1920x1080 YouTube, 120-1800 s, ≤ 240 scenes, `lf-*` templates, chapters |
| `voice.provider` | `edge` \| `elevenlabs` \| `none` | `edge` | `none` = silent, captions use estimated timings |
| `voice.voice` | string | `en-US-AndrewMultilingualNeural` | Edge voice name or ElevenLabs `voice_id` |
| `voice.rate` | `"+10%"` | `+10%` | speaking rate (ElevenLabs: mapped to `speed` 0.7-1.2) |
| `voice.pitch` | `"+0Hz"` | `+0Hz` | Edge only |
| `voice.model` | string | `eleven_multilingual_v2` | ElevenLabs only |
| `theme` | string | `default` | `themes/<theme>.css` |
| `music` | `{path, volume}` | none | path relative to the spec or URL; looped, faded, ducked under the voice |
| `captions.enabled` | bool | `true` | burned-in captions on/off (SRT is always written) |
| `captions.style` | `karaoke` \| `pop` \| `plain` | `karaoke` | karaoke = active word on an accent pill; pop = words appear as spoken |
| `captions.max_words` | 2-4 | 3 | words per caption chunk |
| `captions.position` | `lower` \| `middle` | `lower` | lower = just above Instagram's bottom UI |
| `captions.uppercase` | bool | `false` | |
| `brand` | `{wordmark, handle, bug}` | `FRONTIER FEED`, `""` (hidden), `true` | corner bug and outro text |
| `text` | `minimal` \| `full` | `minimal` | `minimal` hides secondary labels (kickers, deks, media labels, stat context, compare notes, quote roles) and shows headline media full-bleed; `full` restores the old card layouts |
| `fps` | 24/25/30/60 | 30 | keep 30 for Instagram |
| `lead` | seconds | 0.12 | default silence before each scene's narration |

### Scene

| Key | Type | Notes |
| --- | --- | --- |
| `template` | string | required; see `studio templates` |
| `narration` | string | spoken text; synthesized per scene. Write numbers the way they should be spoken if the TTS gets them wrong |
| `props` | object | template props (validated against the template contract) |
| `media` | string or object | path (relative to the spec), or URL (downloaded to `cache/`). Object form: `{"src", "start" (video in-point s), "fit": "cover"\|"contain", "position" (CSS object-position), "kind": "image"\|"video"}` |
| `min_duration` | seconds | default 1.5; the scene lasts `max(min_duration, lead + speech + hold)` |
| `hold` | seconds | default 0.35; pause after the narration before the cut |
| `lead` | seconds | override the global lead for this scene |
| `cover` | bool | use this scene for `OUT.cover.jpg` (default: first scene) |
| `cover_time` | seconds | frame time for the cover (default 0.9 s for hooks, 1.4 s otherwise) |
| `source` | string | shown as a small, low-contrast "Source: OpenAI blog" line at the bottom edge; keep it short, full credits go in the caption |

Durations come from the narration audio, so the reel length is decided by the
script. `validate` estimates it (≈2.8 words/s at +10%); the render fails if the
real length exceeds 90 s and warns below 15 s. Target 25-45 s for news.

## Templates

| Name | Use | Key props |
| --- | --- | --- |
| `hook` | opener; headline fully visible on frame 1 | `headline` (2-6 words), `highlight`, `kicker`, `uppercase`, `motion`, `align` (`bottom` default / `top`: text at the top, media's lower-middle stays clear — for 16:9 clips whose subject sits low in the 9:16 crop); optional media full-bleed |
| `headline` | the news itself | `headline`, `kicker`, `dek`, `highlight`; optional media as an image card |
| `media` | screenshot / photo / clip | media required; `caption`, `label`, `motion` (in/out/left/right/push/pan/none; `push`/`pan` are strong camera moves that make a still feel like footage), `frame` (full/card) |
| `stat` | one big number, counts up | `value` ("$2.5B", "87%"), `label`, `kicker`, `context` |
| `quote` | quote + attribution | `quote`, `name`, `role`, `highlight`; optional media as round portrait |
| `list` | 2-4 items revealing | `items`, `title`, `kicker`, `item_times`; items appear when the narration mentions them |
| `compare` | A vs B | `a`/`b`: `{name, value, note}`, `title`, `winner` (a/b/none), `bars` |
| `outro` | CTA + handle | `cta`, `handle`, `sub` |
| `custom` | anything else | `html`, `css`, `js` (raw, see below) |

Long-form templates (`"format": "longform"`; `media` and `custom` work in both formats):

| Name | Use | Key props |
| --- | --- | --- |
| `lf-open` | cold open, the peak moment on frame 1 | `headline` (2-7 words), `highlight`, `motion`; optional full-bleed media |
| `lf-chapter` | chapter card (2-4 s); pair with the scene key `chapter` | `number`, `title`, `highlight`; optional dimmed media |
| `lf-stat` | one key number, counts up; footage on the right half | `value`, `label`, `highlight`, `count` |
| `lf-quote` | key clause of a sourced quote | `quote`, `name`, `highlight`; optional media on the right half |
| `lf-points` | 2-5 points revealing with the narration | `items`, `title`, `item_times`; optional media on the right half |
| `lf-end` | end screen, 10-20 s, right side free for YouTube end-screen elements | `line`, `highlight` |

Scene key `chapter` (long-form): a chapter starts at this scene; the first scene
must have one, and YouTube shows chapters only when there are at least 3.

`highlight` accepts a word/phrase or a list of them; matches are colored in the
accent. Long text auto-shrinks to fit (`data-fit`), and a warning is reported if
it cannot fit at the minimum size: shorten the text in that case.

### Layout and safe zones

Long-form (1920x1080): content area x 120..1800, y 96..830; captions centred on
y = 930 at 50 px; wordmark bug top-left; credit line at the bottom-left above
YouTube's player controls. The rest of this section describes the reel canvas.

Canvas 1080x1920. Instagram covers roughly the top 230 px (header), the bottom
20 % (caption/UI) and the right 12 % (action rail). The theme defines:

- content area: `.content` = x 72..940, y 250..1190 (`--safe-*`, `--content-bottom`)
- source label: bottom edge (y ≈ 1860), 19 px, 50 % opacity
- captions: centered on y = 1395 (`--caption-center`), above the bottom UI
- wordmark bug: top-left at y = 168

### Writing or editing a template

Create `templates/<name>.html`. It is a Jinja2 fragment rendered inside
`_base.html` (theme CSS, shared CSS, runtime, chrome, captions). Start it with
the props contract, which `validate` and `templates` use:

```html
<!-- studio:meta
{
  "description": "When to use this template.",
  "media": "none | optional | required",
  "props": {
    "headline": {"type": "string", "required": true, "max": 80, "description": "..."},
    "items": {"type": "array", "items": {"type": "string"}, "min": 2, "max": 4},
    "align": {"type": "string", "enum": ["left", "center"], "default": "left"}
  }
}
-->
<style>
  .tpl-mytemplate .content { justify-content: center; }   /* scope with .tpl-<name> */
</style>
<div class="content">
  <div class="kicker a-slide">{{ p.kicker }}</div>
  <div class="display a-rise" style="animation-delay:.1s" data-fit="110,56" data-fit-h="500"><div>{{ p.headline | hl(p.highlight) }}</div></div>
  <div data-studio-media class="kb-in"></div>
</div>
```

Template context: `p` (props with defaults), `brand`, `has_media`, `duration`,
`fps`. Filters: `hl(words)` (accent highlight), `number` (parse "$2.5B" -> 2.5).
Use `p["items"]` (not `p.items`) for a prop called `items`.

Rules that keep rendering deterministic:

- Animate with CSS animations or the Web Animations API only. All animations
  share the scene clock: `animation-delay: 0.4s` = 0.4 s into the scene.
  `var(--scene-dur)` is the scene length (e.g. Ken Burns over the whole scene).
- Shared animation classes in `_base.css`: `a-rise`, `a-fade`, `a-slide`,
  `a-slide-r`, `a-pop`, `a-wipe`, `a-settle`; Ken Burns `kb-in|out|left|right`
  on a `[data-studio-media]` slot.
- JS effects go through `studio.onFrame((t, duration) => {...})` and must be
  a pure function of `t`. Never use timers, `Date.now()` or `requestAnimationFrame`.
- Runtime helpers: `studio.props`, `studio.duration`, `studio.words` (narration
  word timings), `studio.cue(text, fallback)` (time a word is spoken),
  `studio.ease.*`, `studio.progress(t, start, dur)`, `studio.onInit(fn)`.
- `[data-studio-media]` slots are filled with the scene media (images, or videos
  as pre-extracted frame sequences). A raw `<video>` element also works: it is
  paused and seeked to `t` (+ `data-start`) each frame.
- Hooks must look complete on frame 1: no fade-in from black.

Check a template quickly with `studio still SPEC.json --scene N --t SEC -o x.jpg`.

### Changing the brand

Everything brand-related is in `themes/default.css`: palette (`--bg`, `--fg`,
`--accent` ...), fonts, caption look and safe-area geometry. Copy it to
`themes/<name>.css` and set `"theme": "<name>"` to try a variant.

## How rendering works

1. **Narration**: per scene via edge-tts (`WordBoundary` events) or ElevenLabs
   `/with-timestamps` (character alignment). Cached in `cache/tts/` by
   hash(provider, voice, rate, pitch, text). Provider timings are mapped back
   onto the narration's own tokens so captions keep casing and symbols.
   The Edge endpoint sometimes rejects valid requests; the studio retries with
   inaudible variants (same voice) before giving up.
2. **Timeline**: scene duration = lead + speech + hold (≥ `min_duration`), rounded
   to whole frames. Captions: 2-4 words per chunk, broken at punctuation and pauses.
3. **Media**: URLs downloaded to `cache/downloads/`; images normalized with Pillow;
   videos trimmed/scaled/exploded to JPEG frames with ffmpeg (deterministic and
   independent of the browser's codecs).
4. **Capture**: one HTML page per scene. Frame ranges (≤ 90 frames) are rendered in
   parallel worker processes, each with its own headless Chromium. Per frame the
   runtime pauses all animations and sets their `currentTime`, swaps video frames,
   runs `onFrame` hooks and updates captions; the frame is captured via CDP and
   piped as PNG to ffmpeg (`image2pipe`), which encodes an H.264 segment.
5. **Assembly**: segments are concatenated without re-encoding; narration is
   placed at the scene starts, music is looped and side-chain ducked under the
   voice, the mix is normalized with two-pass `loudnorm` to -14 LUFS / -1.5 dBTP,
   and muxed as AAC 48 kHz with `+faststart`.

Scene changes are hard cuts; each template has a fast (≤ 0.4 s) entry animation,
which reads as a snappy transition.

## Maintenance

- `cache/` can be deleted at any time (TTS will be re-synthesized).
- Re-run `./setup.sh` after moving the folder or on a new machine.
- Typical speed on an M-series Mac: a 34 s reel renders in ~25-40 s
  (8 workers); `--preview` is several times faster.
