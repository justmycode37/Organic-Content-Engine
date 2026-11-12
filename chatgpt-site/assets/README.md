# Motion asset registry

`registry.json` records provenance, rights, restrictions, and a SHA-256 digest for every reusable motion asset. Keep media files under `files/`; captures and cut-outs are tracked with the registry so a ReelSpec resolves to the same content after checkout. No `.gitignore` rule is used here: the current captures are small enough to review and version alongside their provenance. If a future large binary must stay out of git, add a narrow rule only in `assets/files/.gitignore` and document that another checkout will need the file before verification can pass.

## Add and inspect assets

From `chatgpt-site/`:

```sh
node scripts/assets.mjs add ./image.png \
  --id kernel-source --kind image --source-url https://example.com/article \
  --creator "Publisher or creator" --licence "Licence or rights basis" \
  --attribution "Credit line to use" --rights-status licensed \
  --restrictions "Allowed use and required conditions"
node scripts/assets.mjs list
node scripts/assets.mjs verify
node scripts/assets.mjs verify --publish
node scripts/assets.mjs resolve kernel-source
```

Rights statuses are `owned`, `licensed`, `cc`, `public-domain`, `fair-use-news`, and `unknown`. Every status requires a source URL, creator, licence basis, attribution text, restrictions, date, and hash. `verify --publish` also rejects `unknown`. A `fair-use-news` label is an editorial rights assessment, not a blanket legal clearance; preserve the article credit and use the capture only in its documented news context.

`add` copies the input into `assets/files/<id>.<extension>` and calculates the digest. Use a concise immutable ID. When a licence requires attribution, put the exact credit in `attribution` and the relevant limits in `restrictions`. Do not use `unknown` for publishing.

## Link a ReelSpec

ReelSpecs continue to use their existing `assets` path map. Link registry entries without changing the spec schema:

```sh
node scripts/assets.mjs link ../output/video/my-reel.json source-photo
```

Or create a sibling sidecar named `my-reel.registryAssets.json`:

```json
{"registryAssets":["source-photo"]}
```

Then run `node scripts/assets.mjs link ../output/video/my-reel.json`. The command adds or updates each selected map key with a path relative to the spec file. `resolve <id>` prints the absolute path for shell or automation use.

## Cut-outs

`node scripts/assets.mjs cutout assets/files/source-image.png` runs the optional local `rembg` CLI, verifies alpha in the output PNG, and inherits the registered source's licence, credit, and restrictions. Install `rembg[cli]` with a user-level Python environment if available; its first cut-out may download model weights. If the tool or model is unavailable, keep the original image or make a transparent cut-out in a trusted local editor and register it with the same inherited rights; do not upload private source images to an unreviewed background-removal service.
