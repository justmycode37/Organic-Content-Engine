# Audio rights and provenance

Every voice or SFX file placed in a rendered audio cue list needs a matching entry in `ledger.jsonl`. The renderer records new generated outputs with source/model, request and output hashes, generation time, plan, terms reference, permitted uses, and non-beta status. Unknown or missing facts remain on hold.

Generated ElevenLabs sound effects follow the same provider checks as voice: their ledger records name the model, the paid plan tier, the terms snapshot references, all four permitted uses and non-beta status. The renderer also stores each SFX record in the cache sidecar next to the MP3, so the cache audit can restore a missing ledger line.

## Audit a render or the full cache

```sh
node scripts/audio/rights/check.mjs <timed-spec-or-render-manifest>
node scripts/audio/rights/check.mjs --cache
node scripts/audio/rights/cli.mjs check <timed-spec-or-render-manifest>
node scripts/audio/rights/cli.mjs cache
```

The render manifest is written next to the timed spec as `render-manifest.json`. Passing the timed-spec path resolves that sidecar. A missing file, unknown hash, absent terms snapshot, incomplete plan/voice ownership, beta model, or kill-switch match returns a nonzero status.

Unledgered audio in the existing cache is recorded as `unverified` when the cache audit runs. The old Arthur cache stays on HOLD until the owner copies `attestations/arthur.example.json` to `attestations/arthur.json`, fills in who/when, and adds one `outputs` entry per exact SHA-256 from `node scripts/audio/rights/check.mjs --cache`. Each entry needs its own generation time, paid plan, model/version, voice owner, evidence and verified terms snapshot reference. The pre-ledger request hash remains unknown unless retained generation evidence supplies it. A successful audit appends the exact attested record to the ledger so claims packets preserve it. Do not infer the historical plan or terms from the current account.

## Terms and clearances

Capture exact source text with `scripts/audio/rights/snapshot.mjs`. A snapshot is evidence of the terms page retrieved at that time; an owner still needs to confirm the applicable contract, account plan, voice permissions, and intended commercial/platform uses. ElevenLabs output on a paid plan and non-beta model is eligible for commercial use under the documented terms, but the current Arthur library voice remains unverified until those account-specific facts are supplied. Private Voice Design is the intended future narrator; it is not an exclusive identity right.

## Kill switch and dispute packet

Edit `kill-switch.json` to set `pauseAll`, or add a voice ID, provider, asset ID, or output SHA-256 to the matching list. Motion audio checks it before synthesis/reuse, and the rights audit checks it before a render can pass.

Create a claims packet with `node scripts/audio/rights/cli.mjs packet <post-id-or-render-manifest>`. It copies the render manifest, matching ledger entries, source audio files, available terms snapshots, hashes, and the current audit result into `.motion-cache/rights-packets/<post-id>/`. Set `MOTION_POST_ID` at render time or pass the manifest path directly.

## Voice providers and timing contract

The provider contract returns audio bytes and ordered word timings in seconds, with the exact pronunciation expansion used by the caption pipeline. ElevenLabs is implemented with its timestamped TTS API. Cartesia, Google TTS, and local Kokoro are deliberately disabled until credentials, plan/terms evidence, exact model/voice configuration, and word timing are verified. See `audio/voice/config.json`; style presets can be reviewed there.
