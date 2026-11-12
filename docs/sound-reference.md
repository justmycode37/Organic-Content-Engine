# Hedgy sound direction and reference measurements

**Shot-author guidance:** For weight or arrival, use `thump`, `thud`, `land`, `clunk`, `stamp`, `sub`, or `drop`; for movement, use `swish`, `whoosh`, `whump`, `slide`, or `whip` (the cinematic default falls into an arrival; set `direction: "up"` for a departure); use `pop`, `pluck`, `coin`, `ding`, `sparkle`, `click`, `tick`, and `tap` as short scale-tuned accents rather than literal clicks; use `build`, `rise`, `reverse`, or `rumble` for a build, with the rise ending exactly on its target cue. Keep `footfall`, `rustle`, `paper`, and `knock` as quiet foley underneath narration. At scene changes, leave room for the soft swell to land on the cut, then the low boom and one tuned accent; keep every effect below the spoken line. `MOTION_SFX_STYLE=cinematic` selects this sound, and `MOTION_SFX_STYLE=foley` restores the earlier dry palette.

## What the reference sounds like

The 8.08-second reference is a centered voice-over over a nearly continuous low bed. Its transients are soft rather than clicky: the early accents combine low falling sweeps with clear harmonic notes, a low tom-like roll gathers around 3.6–4.2 s, and a broad transition swell at 5.44 s resolves into a sub-heavy arrival at 5.89 s. Most energy is below 2.5 kHz; presence and air fall away sharply. The transient tails and sustained low layer make it feel warm and spacious, though the recording also contains music and voice, so the reference effects cannot be measured as isolated stems.

The supplied reference was decoded directly into memory for measurement; its audio was not saved, sampled, copied, or embedded. The spectrograms below are derived visualizations only. Overall measurements use the stereo mid signal, `(L+R)/2`; stereo width is estimated from side `(L−R)/2` versus mid. Event spectra use a short post-onset window. T20 is the measured time to −20 dB from the local peak; “T60-ish” is a rough `3 × T20` extrapolation, not a measured room-reverb T60. Overlap and music make event-level estimates approximate.

Global reference mix: 670 Hz centroid, −16.79 LUFS, −1.89 dBTP, and 7.0 LU loudness range. Band levels are dBFS RMS. The global power distribution is 20.44% sub, 17.94% low, 29.06% low-mid, 28.42% mid, 3.69% presence, and 0.45% air. Overall side-to-mid level is −7.67 dB, indicating a mostly centered mix.

Voice is not source-separated in this clip. A center-channel 300–3500 Hz speech-active proxy measures −20.51 dBFS RMS; the side-channel full-band RMS over those same frames is −26.51 dBFS, a rough +6.00 dB voice-to-side-bed proxy. This is not a true voice-versus-music/SFX measurement. For comparison, the rendered cinematic voice stem is about +5.9 dB above the power-summed SFX and music stems, close to that proxy while keeping the speech band clear.

### Notable reference events

Local band values are percent of event-window power in this order: sub `<80 Hz` / low `80–250 Hz` / low-mid `250–800 Hz` / mid `800–2500 Hz` / presence `2500–6000 Hz` / air `6000–18000 Hz`. M/S is `10 log10(side power / mid power)`; more negative means more centered. Pitch is the strongest estimated partial, not a claim that the whole score has that key.

| Time | Centroid | Local band energy (%) | Pitch / glide | M/S | Decay estimate | Event reading |
|---:|---:|---|---|---:|---|---|
| 1.476 s | 471 Hz | 20 / 20 / 52 / 6 / 1 / 0 | D♯5 ≈614 Hz; low sweep ≈81→38 Hz | −10.3 dB | T20 .30 s; T60-ish .90 s | Soft tonal pluck with falling low whoosh |
| 1.776 s | 809 Hz | 12 / 17 / 57 / 11 / 1 / 2 | F♯5 ≈732 Hz; low sweep ≈48→38 Hz | −6.7 dB | .26 s; .78 s | Tonal accent, soft attack |
| 2.036 s | 613 Hz | 14 / 34 / 13 / 37 / 1 / 1 | G♯5 ≈840 Hz; low sweep ≈102→43 Hz | −7.2 dB | .34 s; 1.02 s | Harmonic accent over a falling sub sweep |
| 2.376 s | 438 Hz | 12 / 15 / 61 / 10 / 1 / 0 | C♯4 ≈280 Hz; low sweep ≈38→27 Hz | −6.2 dB | .21 s; .63 s | Warm, tuned low-mid pluck |
| 2.586 s | 328 Hz | 31 / 14 / 46 / 9 / 0 / 0 | C♯4 ≈280 Hz; low component rises ≈38→54 Hz | −8.1 dB | .41 s; 1.23 s | Low boom with a tonal body |
| 3.546 s | 332 Hz | 24 / 27 / 43 / 6 / 0 / 0 | C♯5 ≈560 Hz; low component rises ≈43→54 Hz | −7.7 dB | .33 s; .99 s | Tuned note into the build |
| 3.876 s | 202 Hz | 30 / 48 / 19 / 4 / 0 / 0 | Roll centered near 54 Hz | −4.8 dB | >1.20 s measured (window capped); residual roll about .5–.8 s | Low tom/drum roll, broadest event in stereo |
| 5.436 s | 3316 Hz | 0 / 2 / 57 / 19 / 4 / 18 | No confident harmonic pitch; low sweep ≈108→59 Hz | −10.0 dB | .45 s; 1.35 s | Airy, broad transition transient / swell |
| 5.886 s | 117 Hz | 77 / 20 / 1 / 0 / 0 / 0 | A1-region ≈54 Hz | −7.8 dB | .25 s; .75 s | Soft sub boom at the scene change |
| 6.136 s | 167 Hz | 51 / 47 / 1 / 0 / 0 / 1 | A1-region ≈54 Hz | −9.1 dB | .99 s; 2.97 s | Continuing sub swell / long overlapping tail |

The table captures 10 strong spectral/low-band clusters (1.23 clusters/s). A separate envelope detector finds 15 onset groups (1.86/s), some of which are voice consonants. Six of the 10 strong clusters are clearly note-like; that manual event count is not directly comparable to a generated-cue percentage because the reference includes a continuous score. The simple whole-mix decay detector reports mean T20 .26 s (T60-ish .78 s), but the 10 selected events average about .47 s T20; the long roll and final overlapping swell pull the event-specific estimate upward.

## Render comparison

Current A/B is the same Hedgy squeeze spec with `MOTION_VOICE_SPEED=1.15`, `MOTION_LEAD=.04`, `MOTION_TAIL=.14`, stems enabled, and audio-only output. Mix spectral values are dBFS RMS; stem LUFS and true peak are metered from the exported stems. T20/T60-ish are event-envelope estimates. The reference has no separated voice/SFX/music stems; its single mix row and the voice/side proxy above are the only fair reference measurements.

| Render / stem | Centroid Hz | Bands: sub / low / low-mid / mid / presence / air (dBFS) | Mean T20 / T60-ish | Tonal accent share | Events/s | LUFS | TP dBTP |
|---|---:|---|---|---:|---:|---:|---:|
| Reference — mix | 670 | −23.3 / −23.6 / −21.6 / −21.8 / −30.6 / −39.9 | .26 / .78 s (whole-mix proxy; VO-contaminated) | ≈6/10 note-like strong events (manual) | ≈1.86 envelope groups/s; 1.23 strong clusters/s | −16.79 | −1.89 |
| Foley — mix | 740 | −23.5 / −19.3 / −17.1 / −23.5 / −29.6 / −29.5 | .32 / .95 s (mix; VO-contaminated) | — | 3.30 cues/s | −14.17 | −1.49 |
| Foley — voice | 956 | −41.5 / −26.3 / −21.2 / −27.8 / −33.6 / −33.4 | — | — | — | −18.47 | −4.55 |
| Foley — SFX | 157 | −29.4 / −28.7 / −38.0 / −39.0 / −58.4 / −68.4 | .21 / .63 s | 0.0% | 3.30 cues/s | −25.71 | −6.62 |
| Foley — music | 96 | −32.7 / −30.3 / −43.3 / −65.9 / −95.6 / −100.8 | — | — | — | −29.83 | −14.31 |
| Cinematic — mix | 591 | −22.8 / −19.8 / −17.3 / −21.7 / −29.6 / −37.9 | .38 / 1.13 s (mix; VO-contaminated) | — | 1.90 cues/s | −14.27 | −1.46 |
| Cinematic — voice | 743 | −41.7 / −26.5 / −21.2 / −26.2 / −33.6 / −41.8 | — | — | — | −18.37 | −3.24 |
| Cinematic — SFX | 286 | −29.3 / −33.4 / −42.0 / −34.5 / −50.8 / −80.3 | .33 / .99 s | 27.0% (17/63 cues) | 1.90 cues/s | −26.85 | −9.84 |
| Cinematic — music | 96 | −30.6 / −28.2 / −41.1 / −63.8 / −92.6 / −100.5 | — | — | — | −27.66 | −12.10 |

The cinematic power-summed SFX+music estimate is about −24.23 LUFS, putting the voice roughly +5.9 dB above that bed. Foley is about +5.8 dB. Both are close to the reference's +6.0 dB center-voice-to-side proxy. Rendered mixes are normalized near −14 LUFS with true peaks below −1 dBTP: final foley is −14.17 LUFS / −1.49 dBTP; final cinematic is −14.27 LUFS / −1.46 dBTP. The latter is 0.27 LU below the nominal integrated target, and 0.46 dB below the true-peak ceiling.

The unnormalized reference is 2.79 dB quieter than a −14 LUFS comparison. Adding that offset to its six mix bands gives −20.5 / −20.8 / −18.8 / −19.0 / −27.8 / −37.1 dBFS. Against those level-aligned values, cinematic mix is lower by 2.3 dB in sub, higher by 1.0 dB in low and 1.5 dB in low-mid, then lower by 2.7 dB in mid, 1.8 dB in presence, and 0.8 dB in air. Its centroid is 591 Hz versus 670 Hz. The 1.90 generated cues/s is close to the broad reference onset-envelope rate of 1.86/s, but above the 1.23/s strong-cluster count; those event definitions are not equivalent. Its SFX tail estimate (.33 s T20 / .99 s T60-ish) is close to the reference's short accents and falls short of the long overlapping swell. Scene transitions use a .62 s rise ending on the cut, a sub arrival, then a tuned accent; the last tuned ding reaches the final held frame. The bed key is detected per render from the cached music asset: D♯ minor at confidence .333, so the pentatonic choice is a low-confidence measured fit rather than a fixed preset assumption. No new music or ElevenLabs SFX were generated for these A/B renders; cached assets and procedural SFX were reused.

Remaining gaps: cinematic has more low-mid and less mid/presence energy than the level-aligned reference, and a lower overall centroid. The reference has no stem separation, so its exact independent SFX level, accent share, reverb time, and SFX event rate cannot be recovered. The key detector confidence is modest. The cinematic SFX send is a shared low-passed multi-tap echo, not a measured or convolutional room impulse; the event T60-ish values are extrapolations from envelopes. The comparison supports a closer style match, not a source-identical reconstruction.

## A/B artifacts

- [Foley audio-only render](/tmp/hedgy-sound-work/foley-final.mp4) and [cinematic audio-only render](/tmp/hedgy-sound-work/cinematic-final.mp4)
- [Foley exported stems](/tmp/hedgy-sound-work/foley-final.mp4.stems.mka) and [cinematic exported stems](/tmp/hedgy-sound-work/cinematic-final.mp4.stems.mka)
- [Side-by-side spectrogram](/tmp/hedgy-sound-work/spectrogram-side-by-side.png)
- [Reference spectrogram](/tmp/hedgy-sound-work/spectrogram-reference.png), [foley spectrogram](/tmp/hedgy-sound-work/spectrogram-foley.png), and [cinematic spectrogram](/tmp/hedgy-sound-work/spectrogram-cinematic.png)
