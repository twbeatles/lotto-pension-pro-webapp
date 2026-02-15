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

- Local default (latest): `https://<your-worker>.workers.dev/proxy/latest?draw_no=1180`  
  (set `draw_no` as needed; if omitted, worker tries to fetch draw 1~1200 by default logic)

Use it in the app with:
- localStorage key: `lotto_webapp_settings_v1.proxyLatestUrl`
- query string: `?proxy=<worker_url>/proxy/latest?draw_no=...`

## Notes

- This is optional. The app keeps working entirely from `docs/data/winning_stats.json` when proxy is unavailable.
