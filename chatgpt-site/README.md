# Organic Content Engine — ChatGPT Site

Private social content workspace on ChatGPT Sites, backed by D1 and R2. The enabled networks are Instagram, TikTok, X, YouTube, and LinkedIn. The local Node application at the repository root is separate.

## Access

Sites supplies signed-in identity and owner-only hosting. The browser then requires the workspace password. Password verification and rate limits live on the server; the browser receives a signed HttpOnly, Secure cookie bound to the owner identity. No password is included in the source or frontend bundle. Runtime `APP_PASSWORD_HASH` is a salt and 100,000-round PBKDF2-SHA256 hash. Account credentials are AES-GCM encrypted in D1 with a separate runtime secret.

## Generation with the ChatGPT plan

With the default `chatgpt-plan` generator, text generation uses the connected ChatGPT conversation and its plan. The Site's identity cookie is never an inference credential. Its private MCP server exposes bounded generation requests and draft-saving tools. Publishing provisions the Organic Content Engine plugin; connect it in ChatGPT if it is not automatically available. Monid footage and optional ElevenLabs narration use their own separately billed accounts.

In the Site, prepare ideas, drafts, analysis, or video requests. Open the request in ChatGPT. ChatGPT reads the brand and enabled source material through the Site plugin, generates using the current conversation's plan, and saves the results back. This is a ChatGPT handoff, not an embedded in-page model call. An eligible, separately registered hosted SIWC integration would be needed for direct subscription inference inside the page.

Video generation uses the user's **Monid MCP connection in ChatGPT**, `https://mcp.monid.ai/v1`. A Site login does not forward other ChatGPT connections. ChatGPT follows the video production policy (`docs/content-engine/video-production.md`): it plans the edit, inspects the endpoint's schema and price, generates clean vertical shots with no baked-in text inside the combined spending limit, and calls `save_video_result` once per completed run, attaching an edit plan (hook, cut list, timed captions, end card, narration script) on the final call. This automatically queues narration and editing in the background. The Site imports supported completed MP4 downloads into R2 as raw footage. Monid usage consumes the Monid balance separately from ChatGPT plan usage. Unsupported download hosts require downloading the result and uploading it through Storage. No paid video runs occur merely from viewing the Site.

## Studio: finishing every video

The **AI finishes generated videos automatically**. Saving its final edit plan queues narration, caption timing, compositing, audio mixing and MP4 export. The always-on render worker saves the finished video to private Storage without an open platform tab or human editing.

The **Studio is an optional editor inside the platform's ChatGPT tab**. Open **Edit in Studio** on a generation request or **Open in Studio** for footage from Storage to override the hook, captions, cut list, end card, narration script, voice or music. You can scrub the frame preview, listen to narration and export manually when desired.

Generated clips are raw footage, not deliverables. The Studio turns footage plus its edit plan into the finished video: 1080 × 1920 at 30 fps, cover-fitted and lightly graded footage, cuts with a slow push on every shot, an opening hook title that is present on frame one, captions inside the platform-safe area, an end card with the CTA and brand handle, optional music from Storage, and audio levelled to a consistent loudness. Any MP4/MOV in Storage can be finished the same way.

Automatic export uses a headless worker with the same Studio compositor and audio mix, plus FFmpeg for H.264/AAC encoding on Linux or macOS. The hosted Worker stores the durable queue and private files; it does not encode video itself. Optional manual export uses WebCodecs in a current Chrome, Edge or Safari with the tab kept open. Raw generated footage is marked in Storage and is refused at scheduling and publish time (`finish_required`) until a finished render exists. Your own uploads are not blocked. The Studio sets type and timing; it does not judge footage or transcribe its existing speech. Exports are capped at 90 seconds and sized to fit the 100 MB Storage limit.

### ElevenLabs narration

Add `ELEVENLABS_API_KEY` as a **Site runtime secret** when ready (or in the local Worker's `.dev.vars` for local development). The key needs text-to-speech and voices-read access. It is used only by the Worker and is never sent to the browser. Leaving it unset keeps the rest of the Studio usable and disables narration generation.

The Studio chooses a female voice from the account's live, paginated voice list, prioritizing social-media use, conversational delivery and a bright, energetic tone. It never silently falls back to a male voice. The creator can choose another voice, and that choice is remembered in the browser. `ELEVENLABS_VOICE_ID` optionally pins the initial default; unavailable IDs fall back to the female selection. `ELEVENLABS_MODEL` defaults to `eleven_multilingual_v2`. No voice ID is hard-coded, so the selected voice can be verified when the key is connected.

**Generate voiceover** sends the script to ElevenLabs' [timestamped speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) and uses ElevenLabs credits. Saving a video edit queues paid narration automatically when its script is new. Viewing the Studio or typing an unsaved script does not generate audio. The audio is saved privately in Storage as a voiceover, excluded from future AI source context by default. Word timings create editable captions and drive their animation, including during the opening hook and end card. Custom caption wording uses its own timing. The voice is mixed over quieter music and clip audio. Automatic editing extends trims into unused source footage when needed, keeping shots at most five seconds; when the narration still cannot fit, it returns the job to the AI to shorten the script. Manual exports reject narration that would be cut short. Script changes require regenerating or removing the earlier take before saving or exporting. Technical retries reuse the generated take instead of paying again. The full mix is heard in the exported preview; the editing screen offers a narration-only audio player.

## Always-on render worker

Run one worker on an always-on machine. No renderer service is provisioned merely by changing the Site source. Once deployed and connected, it claims saved edit plans without a visitor session, prepares narration on the Site, downloads only its leased inputs, composites frames with the shared Studio code, encodes H.264/AAC, verifies codecs/dimensions/duration, and uploads the final MP4. Its browser is isolated from external websites. The Site enforces exclusive leases, heartbeats, stale-result rejection, idempotent completion, three technical attempts and two AI plan repairs.

Apply `0005_video_renders.sql` with the other Site migrations. The worker claims existing saved plans in bounded batches on connection; legacy imported footage is classified at read time without a migration backfill. The UI shows queued, rendering, waiting-for-narration and failed states, including whether a worker has checked in recently. Scheduled ChatGPT runs can discover failed/incomplete edits and call `save_video_edit`; a person does not have to perform routine repairs. The renderer finishes requested videos; existing ChatGPT schedules still drive idea generation and existing publishing controls still govern delivery. The AI can call `request_video_for_post` with an already approved per-video budget to link production to an unpublished draft. Completion attaches the MP4 automatically if that draft has not changed; edited or scheduled posts are preserved. Duplicate requests for the same post reuse the existing job. This change does not turn on autopilot or auto-approve posts.

For local development or an always-on Mac:

```sh
cd chatgpt-site
npm ci
cp .renderer.env.example .renderer.env
# Set the Site origin, OCE_RENDER_TOKEN, and private-Site service credential in .renderer.env.
# Install FFmpeg/ffprobe and Google Chrome on the worker machine.
npm run render:worker
# Process at most one queued job while diagnosing setup:
npm run render:worker -- --once
```

The ignored `.renderer.env` holds `OCE_SITE_URL` and `OCE_RENDER_TOKEN`, matching `RENDER_WORKER_TOKEN` on the Site. This credential can only access the render queue. `JOB_TOKEN` remains supported as a fallback for older installations. Private Sites also need an existing service-access bearer token as `OCE_SITES_ACCESS_TOKEN`, sent in `OAI-Sites-Authorization`; the application credential alone cannot pass the hosting sign-in gate. Both credentials remain in the Node process and are never given to its headless browser. An unavailable credential or renderer is shown as waiting/failed setup rather than successful editing.

For this Mac, `npm run render:mac:install` accepts the worker configuration as hidden JSON on stdin and installs a login service named `ai.organic-content-engine.renderer`. It copies a prebuilt worker, compositor and browser driver into `~/Library/Application Support/Organic Content Engine/renderer`, keeping the runtime configuration owner-readable. It needs no access to the repository after installation. The service starts after login, restarts on failure, and resumes when the Mac wakes. It does not prevent sleep.

```sh
npm run render:mac:status
npm run render:mac:stop
npm run render:mac:start
```

Logs live in `~/Library/Logs/Organic Content Engine/`. Re-run the installer after changing worker source to update its installed copy. Keep machine credentials out of command arguments and source control.

For an always-on Linux host, build from the repository root:

```sh
docker build -f chatgpt-site/renderer.Dockerfile -t organic-content-renderer .
docker run -d --restart unless-stopped --init --shm-size=1g \
  --env-file chatgpt-site/.renderer.env organic-content-renderer
```

The image installs Chromium, FFmpeg and fonts. Server hosting is separate from the Site; use an existing server or choose hosting before deployment. This Mac can run the worker while awake. Live narration still requires `ELEVENLABS_API_KEY` on the Site. Browser export and this worker perform technical validation; neither claims a subjective quality score or automatically repairs defective AI-generated footage.

## Storage

Upload any file up to 100 MB. Files stream to private R2; metadata and notes persist in D1. Supported image/video previews remain authenticated. The **Use for content** toggle excludes files from future AI context. Text and notes supply up to 24,000 context characters across the 30 newest enabled files. ChatGPT can read JPEG/PNG/WebP images up to 5 MB through `read_material`. Other documents, video and audio need notes, sampled images, or transcripts; this host does not run ffmpeg or claim full footage understanding. Uploading media does not publish it.

## Social publishing

The Platforms screen offers account authorization, connection state, and disconnect/revocation. Configure developer app registrations first using the names in `.env.example`, with each exact callback shown by the UI. These are application credentials, not social-account passwords. The engine cannot bypass provider app review, eligibility, spending limits, or revoked permissions.

- **Instagram:** MP4/MOV Reels for professional accounts. Create a resumable container, stream bytes to the provider's returned upload URI, wait for processing, then publish. This avoids exposing private Site files as public download URLs. Photo posts, carousels, and Stories are not included.
- **TikTok:** MP4/MOV video, creator-info-driven privacy options, comments/Duet/Stitch controls, commercial disclosure, and explicit music/content consent. The server checks these before scheduling and again at delivery. Unaudited apps remain restricted by TikTok. File uploads are chunked directly to TikTok; accepted uploads remain `processing` until the provider confirms completion.
- **YouTube:** Resumable MP4/MOV uploads, title, description, visibility, audience, and synthetic-media disclosure. The upload session and video ID persist; only processed videos are reported as delivered. Provider quotas and actual visibility remain subject to Google policy and account settings.
- **X and LinkedIn:** Account connections and text publishing. X refreshes renewable tokens; LinkedIn refresh availability depends on the app's grant, otherwise the user reconnects on expiry. LinkedIn requires an explicit supported API version.

Each post is bound to the reviewed account ID. Replacing an account requires reviewing its queued posts again. Media referenced by queued/in-progress posts cannot be deleted. Durable delivery state prevents repeated container/session creation while checking processing. An ambiguous final publish is marked `needs_attention` for a person; the engine does not guess or blindly publish again. The pause control stops new delivery work, but cannot revoke a request already accepted by a provider.

## Background work

There is no persistent timer in a Worker. The owner-authenticated MCP tools `prepare_autopilot` and `process_due_posts` let a linked ChatGPT task prepare bounded requests and process approved scheduled posts while the Site is closed. Autopilot drafts always wait for review; TikTok requires its per-post creator settings and consent. The authenticated `/api/jobs/tick` route remains available for machine callers with `JOB_TOKEN`. A saved schedule is not evidence that an update ran; verify the writer and persisted result after deployment.

## Build and verification

```sh
npm ci
npm run check
```

`check` typechecks the frontend and Worker, builds `dist/server/index.js`, validates its manifest, and runs the actual Worker in workerd with D1/R2 and mocked providers. Tests cover password access, owner isolation, uploads, generation tools, the footage → edit plan → finished-video gate, Studio timeline and text logic, ElevenLabs voice selection/pagination, private narration storage, normalized word timings, error handling and generation locks, OAuth state, delivery processing and retries. When Chrome/Chromium and FFmpeg are installed, the suite also renders a real narrated video, verifies H.264/AAC output and exercises automatic trim extension; this test skips when those binaries are absent. Queue tests cover exclusive claims, narration reuse, waiting credentials, bounded repairs, stale leases and idempotent uploads. Mocked provider tests do not verify a live ElevenLabs key, real app approvals, account eligibility, or live social delivery.

Schema changes are declared in `db/schema.ts` and appended under `drizzle/`; applied migrations are immutable. `.openai/hosting.json` preserves the existing Site ID and declares D1, R2, and MCP. Publish with the Sites workflow to apply pending migrations before deployment.
