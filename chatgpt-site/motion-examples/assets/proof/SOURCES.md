# PROOF ROOM example: source and image provenance

Editorial snapshot: 11 November 2026. This is a style demonstration, not a newly
verified news report or a claim of independent exploit validation.

## Evidence basis

All story facts come from the supplied research
file `output/research/patch-notes-2026-11-11.md` in the repository root. That brief
reports agreement among trade publications but **could not retrieve the primary
OpenAI post (HTTP 403)**. This implementation has not independently verified the
primary page. Recheck it and every number before publishing the reel.
The captured SecurityWeek paragraphs below were read on the live page on
11 November 2026 and agree with the research brief (948 = separate patches;
1,169 exploits; the full quotation).

- Primary, not directly retrieved by the supplied research:
  https://openai.com/index/a-thousand-fewer-paths-to-root/
- SecurityWeek, 5 November 2026:
  https://www.securityweek.com/ai-agents-got-root-on-linux-via-948-kernel-flaws-in-openai-research/
- iTnews, 6 November 2026:
  https://www.itnews.com.au/news/low-privileged-accounts-on-unpatched-systems-as-good-as-root-openai-630145

## Real captures

Both PNG files in this folder are unedited element crops of the public SecurityWeek
article (published 5 November 2026), made with `scripts/styles/proof-capture.mjs`
at a 430 px phone-width viewport, 3x pixel density. Cookie banners, pop-ups and
sticky bars were hidden before the capture; the captured paragraph itself was not
altered, retouched or re-typeset.

URL: https://www.securityweek.com/ai-agents-got-root-on-linux-via-948-kernel-flaws-in-openai-research/

| File | Asset id | Captured (UTC) | Captured text |
|---|---|---|---|
| `securityweek-948.png` | `sw-count` | 2026-11-11T16:13:37Z | "OpenAI says the 948 figure reflects the number of separate patches created for the bugs behind those exploits. Before anything went to kernel maintainers, its security researchers checked the exploits and fixes, along with the severity the system proposed." |
| `securityweek-quote.png` | `sw-quote` | 2026-11-11T16:13:42Z | "The company also warned defenders: “For the near and medium term, having access to a low-privileged account on an operating system, that isn’t up-to-date on its latest available patches should be considered functionally equivalent to root access for a well-resourced threat actor.”" |

The example reads both captures clause by clause. The camera travels across the
original pixels and a yellow marker lands on each clause at its spoken anchor.
The image is composited with `multiply` onto the reel's paper, so the page's
white background takes the paper colour. Glyph pixels are not altered, retouched
or re-typeset. Source domain and capture date appear in every capture scene; the
complete URL and UTC timestamps are retained above. Clause boxes, in original
pixels as `[x, y, w, h]` (line tops 19 + 75·(line − 1), height 46):

| Capture | Clause | Box(es) |
|---|---|---|
| `securityweek-948.png` | OpenAI says | `[3,19,244,46]` |
| | 948 | `[339,19,77,46]` |
| | separate patches | `[2,94,343,46]` |
| | researchers checked | `[174,244,405,46]` |
| | the exploits and fixes, | `[594,244,431,46]` |
| `securityweek-quote.png` | low-privileged | `[675,94,282,46]` |
| | latest available patches | `[126,244,466,46]` |
| | functionally equivalent | `[1,319,455,46]` |
| | to root access | `[469,319,277,46]` |
| | well- / resourced threat actor.” | `[863,319,99,46]`, `[3,394,463,46]` |

The warning is shown verbatim from the capture, including "for a well-resourced
threat actor". The narration paraphrases it as attributed speech ("OpenAI
warned …") and uses no quotation marks. Only marked clauses are uncovered; the
full paragraph text is above. A short isolated crop must never be presented as
the complete original statement.

## Counting and verdict

948 counts distinct bugs behind 1,169 reported working root exploits. They are
not 948 independent remote compromises. The model was unreleased; numbers are
OpenAI's own. `PARTLY TRUE` assesses the broad headline's missing qualifications,
not a finding that the exact count has been independently proved. The primary
page remains unverified in the provided research. July and October counts are
given in their source's respective terms rather than presented as identical
measurement contracts. No run-duration claim is made.
