# PATCH NOTES — design blueprint

Version 1.2 · Recommended visual direction · Updated 11 November 2026

## A visual language with room to move

**Black and white. Pixel titles. Freedom in the composition.**

This guide offers recommendations, not a restrictive template system. The aim is a recognizable visual family across different stories. The examples show how the style can feel; they do not prescribe every Reel, cover or slide.

The recommended anchors are white pixel titles, the pixel wordmark, monochrome graphics and readable reporting. Framing, title position, pacing, editing, sequencing, imagery and layout are open to interpretation. Use another approach whenever it makes the story clearer or more interesting.

There is no requirement to repeat the demo frame, headline band, central clip, footer, gradient, slide count or exact timing of an example.

## Creative reference priorities

**speedy_devv is a major guide for Reels**, especially visual explanations of mechanisms through animated objects, diagrams, cutaways and short text beats. Heavily pursue that kind of explanatory storytelling in PATCH NOTES' identity. A character host, a particular 3D rendering style or a fixed layout is optional.

**ohmo.ai is a major guide for AI news packaging**, including strong covers, compact context, source-led graphics and supporting carousel or demo treatments.

The [brand guide](BRAND.md#creative-references-and-their-roles) records inspected sources and observation limits. These references guide creative decisions; they do not require reproduction of exact frames or establish why particular posts performed well.

## Recommended palette

| Token | Value | Suggested use |
| --- | --- | --- |
| `ink` | `#000000` | Canvas, panels, masks and text on white |
| `paper` | `#FFFFFF` | Pixel titles, wordmark, body copy, icons, rules and inverted panels |

Use a black, white and grey base with exactly one aggressive accent per post, reserved for the single most important element: a key word, active node or winning value. Default to red `#FF2B2B`; alternates are lime `#B8FF1A`, orange `#FF5A00`, blue `#2F6BFF`, magenta `#FF1F8E` and yellow `#FFE600`. Never use accent as a background tint, gradient or second hue. Captions and subtitles use bold clean sans in plain white on dark (black on light); never pixel type, with only the key word in the accent. Keep pixel type for titles, labels, tags, numerals and details.

Source photographs and clips can usually be grayscale. Preserve original color when it is needed to understand the result or reporting. Avoid transformations that change the meaning of source charts or interfaces. The surrounding brand graphics remain monochrome.

## Pixel typography throughout the identity

Recommend **pixel art for every authored title**: cover headlines, Reel hooks, carousel headings, end cards and section titles. Short tags, numerals, labels and arrows can use the same alphabet. Titles inside an original screenshot may remain in their source typography.

| Role | Recommended typeface | Treatment |
| --- | --- | --- |
| Wordmark | Supplied custom pixel SVG | Original white artwork |
| All authored titles and on-screen hooks | Patch Notes Pixel | Uppercase, Regular 400 |
| Categories, short tags, dates and pagination | Patch Notes Pixel | Short uppercase labels and pixel numerals |
| Body and captions/subtitles | Inter 800 | Clean, bold sentence case; white on dark, black on light; only the key word accented |
| Dense credits or technical strings | Inter or readable system monospace | Prioritize clarity at small sizes |

[Patch Notes Pixel TTF](assets/patch-notes-pixel.ttf) is created from the wordmark's original 5 × 7 grid. It includes A–Z, digits, punctuation and common editorial symbols; lowercase input renders as uppercase glyphs. The [WOFF](assets/patch-notes-pixel.woff) is supplied for web use and embedded in the visual blueprint, so pixel titles work offline.

[Inter](https://fonts.google.com/specimen/Inter) is the recommended companion for longer reading. The preview loads it online, with Arial as a fallback. Install or package the body font in the production tool.

Avoid synthetic bolding or compressed tracking on the pixel face. Change size, line breaks or composition for hierarchy.

### Suggested sizes

Starting ranges for a **1080 px-wide master**, not fixed requirements:

| Role | Starting size | Suggested line height |
| --- | --- | --- |
| Cover title | 100–120 px, Patch Notes Pixel 400 | 1.15–1.25 |
| Reel title or hook | 80–100 px, Patch Notes Pixel 400 | 1.15–1.25 |
| Carousel heading | 80–100 px, Patch Notes Pixel 400 | 1.15–1.25 |
| Short labels | 30–40 px, Patch Notes Pixel 400 | 1.3–1.5 |
| Slide body | 38–44 px, Inter 500 | About 1.25 |
| Captions/subtitles | 48–56 px, Inter 800 | About 1.12; clean sans, never pixel type |

The font's visible capitals occupy 70% of the em. At a nominal 100 px, each square module is 10 px and the visible capital is 70 px high. Nominal sizes such as 80, 100 and 120 px provide whole-number module sizes for raster export.

Pixel type is wide. Shorten a long title or change the arrangement before making it too small. Around 2–4 lines may work; let the wording and available space decide. Check the phone-size result.

## More pixel art beyond the titles

Draw freely from this vocabulary rather than placing the same decoration on every post:

- **Square tags:** category chips, version labels and short source markers.
- **Stepped arrows:** swipe cues, comparisons and visual connections.
- **Block dividers:** separated square pixels, progress markers and square rules.
- **Pixel icons:** cursors, play symbols, brackets, stars and numbered markers.
- **Dithered illustration:** planets, devices, diagrams or abstract textures when illustration helps. The [pixel orbit](assets/patch-notes-pixel-orbit.svg) is one example.
- **Stepped edges:** grid-aligned cutouts or frame details when useful.
- **Pixel motion:** block reveals, stepped wipes, square indicators and cursor blinks.

A clean clip with a pixel title may be enough. Another story can support a more illustrated treatment. Keep actual footage and screenshots clear; pixelating evidence is not necessary to make it feel branded.

## Wordmark and avatar

The [wordmark](assets/patch-notes-wordmark-white.svg) uses original 5 × 7 pixel glyphs without a live-font dependency. Suggested treatments are the white horizontal mark on black, the stacked mark for compact space, and the white `PN` monogram for a small avatar. A black holding panel can support it on white or busy layouts.

One glyph height of clear space is a useful reference. The sample social studies use a visible mark 366 px wide in a 1080 px master; its position and size may change with the composition. Preserve the proportions and square geometry.

The transparent PNG is 1125 × 315 px with clear space, with a visible mark of 915 × 105 px. The avatar is 1080 × 1080 px, with the monogram inside a circle-safe region.

## Composition recommendations

Grid-aligned spacing, square forms and clear hierarchy help different posts feel related. A 12 px spacing unit and side margins around 72–96 px are useful starting points at 1080 px width. Adjust them for the composition.

Titles may be left aligned, centered, over footage or in a separate area. Black panels, white panels, split layouts, full-screen animation and largely typographic compositions can all fit. Let the story choose its form.

Let the main visual explain something: an actual interface, a relevant person, a research figure, a demo output or an original illustration of a mechanism. An explanatory illustration helps understanding; it does not prove that a capability was demonstrated in reality.

## Canvas and crop starting points

| Asset | Suggested master | Consideration |
| --- | --- | --- |
| Reel | 1080 × 1920, 9:16 | Leave room for app controls and check important text in the publishing preview |
| Reel cover | 1080 × 1920 | Design the crop separately if the video frame crops poorly |
| Carousel | 1080 × 1350, 4:5 | Keep one carousel's export dimensions consistent |
| Static news card | 1080 × 1350, 4:5 | Choose a composition that works in a single frame |
| Avatar | 1080 × 1080 | Keep the important artwork inside a circle-safe center |

These are production recommendations, not universal Instagram limits. Overlays and crops vary. A text-safe region around x=96–900 and y=240–1500 is a useful first pass for a 1080 × 1920 Reel, followed by an actual crop check.

## Style directions, not prescribed formats

### Visual mechanism explainer — major Reel priority

Use speedy_devv as major guidance for the kind of story: something familiar raises a question, a magnified or simplified view reveals what is happening, and successive scenes build understanding.

For PATCH NOTES, that might become a prompt moving through a model, an agent calling tools, an illustrated memory window or a sequence showing how a result is constructed. Research the actual mechanism before designing the scenes. Simplify accurately and label metaphors when needed.

Use the shared code-animation motion library as the primary Reel production method. Keep the speedy_devv-inspired explanation fast paced, with scene changes every 1.5–4 seconds and constant motion. Pixel typography, monochrome objects, stepped arrows, labeled layers and diagrams supply the identity; use the single accent only on the important element. A simple 2D diagram can be stronger than expensive 3D.

### Demo-led Reel — one option

A pixel hook above a demonstration with black framing is one possible arrangement. It illustrates a visual treatment rather than defining the account's mandatory structure.

Full-screen footage, a corner title, commentary, a split-screen explanation or another edit can work equally well. Some clips need almost no framing. Let the media determine the presentation and length.

### News cover — one option

A short pixel title can pair with a dominant image, source graphic or dithered illustration. A black overlay helps when text sits over busy imagery. A white composition or a separate title panel may be stronger for another story.

The sample puts its title low in the frame and the wordmark above it. Those are decisions for that example, not placement requirements.

### Carousel inside — one option

A media window, pixel heading and short explanation is one possible slide. Another might be a quote, comparison, annotated screenshot, full-bleed image or diagram. Keep the sequence recognizable without making every slide identical. Adapt the order and number of slides to the report.

## Motion and audio recommendations

Open on something worth understanding. Develop explanatory motion around meaningful steps: reveal a layer, connect two objects, compare states, follow a process or change scale. Pixel title entrances, block reveals and stepped details are options; a clean hard cut or quiet hold may be better.

Code-animated Reels built with the shared motion library are the primary Reel method. Default to fast pacing: scene changes every 1.5–4 seconds with constant motion. Keep captions/subtitles bold clean sans, white on dark and black on light, with only the key word accented. Generated footage suits stories needing real-world imagery.

## Export and handoff

PNG in sRGB is a useful starting export for static posts. Deliver carousels as equal-size ordered images. For Reels, MP4 with H.264 video and AAC audio when present, at 1080 × 1920 and 30 fps, is a practical starting preset. Adjust to source motion and delivery needs.

Keep editable masters, fonts, source assets, credits, script, caption and exports together. Visual explainers also benefit from an editable storyboard and reusable diagram or motion assets. The asset builder, `python3 docs/brands/patch-notes/assets/build_assets.py`, regenerates the original pixel font, artwork and logos; it requires Pillow and fontTools.

Before delivery, check readability, source accuracy, final cropping and whether the result feels like PATCH NOTES. The aim is to support the story, not match a template exactly.

Explore the [interactive style studies](design-blueprint.html). The example copy and media are illustrative.
