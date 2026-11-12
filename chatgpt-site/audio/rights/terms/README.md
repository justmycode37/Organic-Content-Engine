# Terms snapshots

Each snapshot is an immutable `<id>.snapshot` body plus `<id>.json` metadata containing the HTTPS source URL, capture time, content type, and SHA-256. Create one with:

```sh
node scripts/audio/rights/snapshot.mjs <id> <https-url>
```

Snapshotting does not interpret a licence or grant rights. A ledger reference clears only if the snapshot exists, its hash verifies, and the corresponding owner/plan/use fields are complete. Keep provider terms, service-specific terms, and voice-library terms as separate snapshots where they apply.
