# Hedgy account worker

The account worker claims scheduled account jobs and generates a reel using the local `OPENAI_API_KEY`, then invokes `scripts/motion-audio.mjs` with `ELEVENLABS_API_KEY`. Speech settings are tempo `0.85`, lead `0.04`, tail `0.12`. It uses the authenticated `workerConfig` and `siteRequest` shared with the render worker and uses an isolated headless Chromium for rendering; no open user tab is needed.

Run with Node 24 from `chatgpt-site`: `node scripts/account-worker.mjs`. Required environment values are `OCE_SITE_URL`, `OCE_RENDER_TOKEN` (or `JOB_TOKEN`), `OPENAI_API_KEY`, and `ELEVENLABS_API_KEY`; optional `OCE_SITES_ACCESS_TOKEN` is shared with the renderer. Cache files under `.account-cache` preserve generated specs and finished MP4s by durable job ID, allowing finish retries to skip paid generation.

On macOS install a login LaunchAgent with `node scripts/install-account-worker.mjs`, providing a JSON object on stdin, . Include the required environment values in that object. The installer copies worker sources to `~/Library/Application Support/Organic Content Engine/account-worker` and stores credentials in a mode-0600 env file; it prints no credential values. The LaunchAgent starts at login and restarts after exit. Keep Node, ffmpeg, and ffprobe installed and available at their usual paths.

The Mac must remain awake and online. The dedicated ACCOUNT_WORKER_TOKEN on the Site matches this worker's OCE_RENDER_TOKEN. Meta App credentials and Instagram authorization remain required for posting.
