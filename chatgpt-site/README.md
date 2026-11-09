# Organic Content Engine — ChatGPT Site

Private social content workspace on ChatGPT Sites, backed by D1 and R2. The enabled networks are Instagram, TikTok, X, YouTube, and LinkedIn. The local Node application at the repository root is separate.

## Access

Sites supplies signed-in identity and owner-only hosting. The browser then requires the workspace password. Password verification and rate limits live on the server; the browser receives a signed HttpOnly, Secure cookie bound to the owner identity. No password is included in the source or frontend bundle. Runtime `APP_PASSWORD_HASH` is a salt and 100,000-round PBKDF2-SHA256 hash. Account credentials are AES-GCM encrypted in D1 with a separate runtime secret.

## Generation with the ChatGPT plan

This Site does **not** call a metered model API or reuse its identity cookie as an inference credential. Its private MCP server exposes bounded generation requests and draft-saving tools. Publishing provisions the Organic Content Engine plugin; connect it in ChatGPT if it is not automatically available.

In the Site, prepare ideas, drafts, analysis, or video requests. Open the request in ChatGPT. ChatGPT reads the brand and enabled source material through the Site plugin, generates using the current conversation's plan, and saves the results back. This is a ChatGPT handoff, not an embedded in-page model call. An eligible, separately registered hosted SIWC integration would be needed for direct subscription inference inside the page.

Video generation uses the user's **Monid MCP connection in ChatGPT**, `https://mcp.monid.ai/v1`. A Site login does not forward other ChatGPT connections. ChatGPT discovers and inspects a video endpoint, checks the chosen spending limit, submits a run, waits for its actual result, and calls `save_video_result`. The Site imports supported completed MP4 downloads into R2. Monid usage consumes the Monid balance separately from ChatGPT plan usage. Unsupported download hosts require downloading the result and uploading it through Storage. No paid video runs occur merely from viewing the Site.

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

`check` typechecks the frontend and Worker, builds `dist/server/index.js`, validates its manifest, and runs the actual Worker in workerd with D1/R2 and mocked providers. Tests cover password access, owner isolation, uploads, generation tools, OAuth state, delivery processing and retries. Mocked provider tests do not verify real app approvals, account eligibility, or live social delivery.

Schema changes are declared in `db/schema.ts` and appended under `drizzle/`; applied migrations are immutable. `.openai/hosting.json` preserves the existing Site ID and declares D1, R2, and MCP. Publish with the Sites workflow to apply pending migrations before deployment.
