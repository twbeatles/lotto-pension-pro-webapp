const CACHE_VERSION = 'v5';
const CACHE_APP_SHELL = `lotto-app-shell-${CACHE_VERSION}`;
const CACHE_DATA = `lotto-data-${CACHE_VERSION}`;

const APP_SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './assets/app.css',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/backtest.worker.js',
    './assets/modules/index.js',
    './assets/modules/core/LottoApp.js',
    './assets/modules/core/DataManager.js',
    './assets/modules/core/StrategyCatalog.js',
    './assets/modules/core/StrategyEngine.js',
    './assets/modules/core/StrategyFilters.js',
    './assets/modules/core/MonteCarlo.js',
    './assets/modules/core/UIManager.js',
    './assets/modules/utils/utils.js',
    './assets/modules/utils/config.js',
    './assets/modules/utils/loader.js',
    './assets/modules/utils/perf.js',
    './assets/modules/features/Ai.js',
    './assets/modules/features/Backtest.js',
    './assets/modules/features/Check.js',
    './assets/modules/features/DataIO.js',
    './assets/modules/features/Generator.js',
    './assets/modules/features/QrScanner.js',
    './assets/modules/features/Stats.js',
    './data/winning_stats.json'
];

self.addEventListener('message', (event) => {
    if (event.data?.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

async function safePrecache() {
    const cache = await caches.open(CACHE_APP_SHELL);
    const jobs = APP_SHELL_ASSETS.map(async (url) => {
        try {
            await cache.add(url);
        } catch (e) {
            // Ignore individual failures to avoid install rejection
        }
    });
    await Promise.allSettled(jobs);
}

self.addEventListener('install', (event) => {
    event.waitUntil(safePrecache());
});

async function putIfOk(cacheName, request, response) {
    if (!response || (!response.ok && response.type !== 'opaque')) return;
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
}

async function networkFirstWithTimeout(request, cacheName, timeoutMs = 2500) {
    const cache = await caches.open(cacheName);
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('network-timeout')), timeoutMs);
    });

    try {
        const networkRes = await Promise.race([fetch(request), timeoutPromise]);
        await putIfOk(cacheName, request, networkRes);
        return networkRes;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
            return cache.match('./index.html');
        }
        throw e;
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
        .then((res) => {
            putIfOk(cacheName, request, res);
            return res;
        })
        .catch(() => null);

    if (cached) {
        networkPromise.catch(() => null);
        return cached;
    }
    const network = await networkPromise;
    if (network) return network;
    if (request.mode === 'navigate') {
        const shell = await caches.open(CACHE_APP_SHELL);
        return shell.match('./index.html');
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    const isDataRequest = url.pathname.endsWith('.json') || url.pathname.startsWith('/data/');
    if (isDataRequest) {
        event.respondWith(networkFirstWithTimeout(event.request, CACHE_DATA, 2400));
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(networkFirstWithTimeout(event.request, CACHE_APP_SHELL, 2200));
        return;
    }

    event.respondWith(staleWhileRevalidate(event.request, CACHE_APP_SHELL));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const valid = new Set([CACHE_APP_SHELL, CACHE_DATA]);
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => {
            if (!valid.has(key)) return caches.delete(key);
            return Promise.resolve();
        }));
        await self.clients.claim();
    })());
});
