# BREAKING INTERNET asset provenance

## Original illustrations

- `server-rack.svg` and `server-rack.png`: original procedural server-rack drawing created for this example. No photograph, real-person likeness, logo or third-party artwork. Transparent PNG, 600 × 800.
- `terminal.svg` and `terminal.png`: original procedural generic terminal illustration. Not a product screenshot or actual exploit output. Transparent PNG, 800 × 600.
- Source generator: `scripts/styles/breaking-assets.mjs`. Both illustrations are dedicated to CC0-1.0 for reuse. No attribution required. License: https://creativecommons.org/publicdomain/zero/1.0/.
- Local background-removal check: `python3 -m rembg --help` returned `No module named rembg`; pip is available. No model installation or image download was needed: the allowed original-object fallback was used.

## Editorial evidence

The example uses only the provided `output/research/patch-notes-2026-11-11.md` story facts and its caveats. These are OpenAI-reported results relayed in trade press, not independently reproduced findings. The research records HTTP 403 for the primary post. This implementation does not upgrade that evidence status or claim independent primary-source verification. No direct quotation is used in the example.

- OpenAI primary post (not directly verified in the supplied research): https://openai.com/index/a-thousand-fewer-paths-to-root/
- SecurityWeek: https://www.securityweek.com/ai-agents-got-root-on-linux-via-948-kernel-flaws-in-openai-research/
- iTnews: https://www.itnews.com.au/news/low-privileged-accounts-on-unpatched-systems-as-good-as-root-openai-630145
- CSA research note: https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-industrialized-linux-lpe-exploit-genera/

The 948 figure counts distinct bugs behind working local root exploits; 1,169 counts the working exploits. Local access is required. Patch counts are a dated snapshot from the supplied research, not live status. The model is unreleased and unnamed. The illustrations are explanatory, not evidence of a live intrusion. The style draws no LIVE bug or other simulated live-feed chrome.
