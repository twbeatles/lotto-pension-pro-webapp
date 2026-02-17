# Lottery Proxy (Optional for dynamic sync)

This repository includes a reference Cloudflare Worker that forwards lottery API calls
from the browser to the official API with CORS headers.

`proxy/latest` in the SPA reads from a configurable endpoint, so you can switch
between local static mode and proxy mode without changing the app code.

## Deploy (Cloudflare Workers)

1. Install Wrangler.
2. Set `LOTTO_PROXY_URL` secret variable if you want to expose a specific official endpoint.
3. Deploy `worker.js`.

```bash
wrangler deploy proxy/worker.js
```

## Query

- Latest (single draw): `https://<your-worker>.workers.dev/proxy/latest?draw_no=1180`
- Range (batch): `https://<your-worker>.workers.dev/proxy/range?from=1175&to=1180`

`/proxy/latest` response format:
- default: `hybrid` (legacy + normalized 함께 제공)
- `?format=legacy`: legacy 포맷 (`data.list[0]`)
- `?format=normalized`: normalized 포맷 (`data: [{ draw_no, numbers, ... }]`)

`/proxy/range` response format:
- default: normalized 배열 (`data: []`)
- `?format=legacy`: legacy 배열 (`data.list`)
- `?format=hybrid`: normalized + legacy 동시 제공

Use it in the app with:
- query string: `?proxyUrl=...` or `?proxy=...`
- legacy localStorage key: `lotto_webapp_settings_v1.proxyLatestUrl`
- v2 settings key: `lotto_pro_settings_v2.customProxy`
- resolution priority: `query` > `v1` > `v2` > public fallback

## Notes

- This is optional. The app keeps working entirely from `docs/data/winning_stats.json` when proxy is unavailable.
