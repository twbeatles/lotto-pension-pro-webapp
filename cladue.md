# cladue.md

Compatibility alias for workflows that reference the misspelled filename.

Use [claude.md](./claude.md) as the canonical handoff document.

Current product name: `로또·연금복권 프로`.
Current backup schema: v5 with Pension720+ tickets and campaigns.
Current backup import size limit: 32MB.
Current destructive import/cleanup behavior: prefer File System Access API backup writes, then fall back to download-plus-confirm when unsupported.
Current service worker cache version: `v27`.
Current strategy worker asset query version: `v22`.
Current release data gate: `npm run build:release` includes strict Lotto freshness plus official latest-draw field comparison.
