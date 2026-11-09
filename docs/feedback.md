# Post feedback

Feedback is a manual learning loop for content. It records a human-selected
format, a qualitative verdict, notes, and optional outcome counts. You can
record a verdict before a post is published; outcome counts can only be saved
after it reaches `published`. The app can use the accumulated records as
conservative guidance when generating ideas and drafts.

Feedback is not social analytics integration. The app does not fetch
impressions, engagements, or conversions from platforms, verify submitted
counts, attribute outcomes to a post, or guarantee that a format will perform
similarly again. You enter and interpret those measurements yourself.

## Record feedback

The API contract is in [backend.md](backend.md). `GET /api/feedback` returns
`{ entries, formats }`. Use `PUT /api/posts/:id/feedback` to save a post's
feedback:

```json
{
  "format": "short tutorial",
  "verdict": "iterate",
  "notes": "The opening was clear; the example arrived too late.",
  "impressions": 1200,
  "engagements": 48,
  "conversions": 3
}
```

Feedback is one record per post; saving again replaces that post's previous
record. `format` is the label used to group comparable posts. Keep labels
consistent (for example, use `short tutorial` each time rather than switching among
`tutorial`, `how-to`, and `quick lesson`). `verdict` is `successful`, `iterate`,
`discard`, or `null` when you do not want to assign a verdict. Notes should
capture what you observed and what to change. The three count fields are
optional manual measurements. Each must be a non-negative integer.

To make comparisons useful, record measurements over the same observation
window after publication, use the same definition of an engagement or
conversion each time, and compare posts from the same platform and similar
audiences. Leave a value empty if it is unavailable; do not enter zero to mean
“not measured.” Counts alone do not establish why a post performed as it did.

## Recommendations and revision

Recommendations group records by platform and format. Generation uses feedback
from the matching platform and topic pillar, including recent notes and
examples, as prompt guidance for ideas and drafts. Recommendations are
`explore`, `reuse`, `iterate`, or `retire`.

The rules are deliberately conservative. A format can be retired after at
least five `discard` verdicts, no `successful` verdicts, and weak engagement
measurements. A weak measurement pattern requires at least three published
posts in that format with 100 or more impressions each, plus at least three
comparable platform measurements; its mean engagement rate must be below 70%
of the platform mean. At least two `successful` verdicts outnumbering
`discard` verdicts can recommend reuse. At least two `iterate` verdicts that
outnumber successes, or weak measurements, can recommend iteration. Strong
measurements can recommend reuse when there are at least three comparable
format and platform measurements and there are no discard or iterate verdicts.
Otherwise the recommendation is `explore`.

Engagement rate is calculated from manually entered engagements and
impressions. Conversion counts are retained for review but do not determine
these format recommendations. Sparse data stays exploratory.

These recommendations guide generation; they do not guarantee what a model
will produce or change existing content. The generator is instructed to treat
retired formats as unavailable and to avoid discarded examples. Retiring a
format does not delete its feedback, posts, or drafts. You can still inspect
the history and choose the format yourself.

Use `POST /api/posts/:id/revise` after saving feedback to ask the generator to
create a revised version using the existing post and its feedback. The source
post needs its linked idea and pillar. With a synchronous generator, the route
returns `201` and a new `needs_review` post. With the hosted ChatGPT plan
generator, it returns `202` and a generation job; completing that job creates
the new review post. In both cases the original stays intact. Review the new
post before approving or scheduling it; revision does not publish the result.
The template generator cannot create feedback-based revisions. On the hosted
backend, unschedule a scheduled post before requesting a revision.

The available feedback route contract and response types are maintained in
[backend.md](backend.md). Recommendations are based only on the feedback stored
in this workspace. They do not represent platform-wide benchmarks, and limited
or inconsistent samples may produce weak guidance.
