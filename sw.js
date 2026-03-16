const CACHE_VERSION = 'v12';
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
    './assets/strategy.worker.js',
    './assets/modules/index.js',
    './assets/modules/bootstrap/pwa.js',
    './assets/modules/core/LottoApp.js',
    './assets/modules/core/DataManager.js',
    './assets/modules/core/StrategyWorkerClient.js',
    './assets/modules/core/StrategyCatalog.js',
    './assets/modules/core/StrategyEngine.js',
    './assets/modules/core/StrategyFilters.js',
    './assets/modules/core/MonteCarlo.js',
    './assets/modules/core/UIManager.js',
    './assets/modules/utils/utils.js',
    './assets/modules/utils/config.js',
    './assets/modules/utils/backup.js',
    './assets/modules/utils/loader.js',
    './assets/modules/utils/perf.js',
    './assets/modules/utils/strategyPresets.js',
    './assets/modules/core/app/dataLists.js',
    './assets/modules/core/app/latestDraw.js',
    './assets/modules/core/app/moduleLoader.js',
    './assets/modules/core/app/settingsPanel.js',
    './assets/modules/core/app/theme.js',
    './assets/modules/core/data/analytics.js',
    './assets/modules/core/data/defaults.js',
    './assets/modules/core/data/persistence.js',
    './assets/modules/core/data/records.js',
    './assets/modules/core/data/sync.js',
    './assets/modules/core/strategy/context.js',
    './assets/modules/core/strategy/evaluation.js',
    './assets/modules/core/strategy/generation.js',
    './assets/modules/core/strategy/request.js',
    './assets/modules/core/strategy/shared.js',
    './assets/modules/core/strategy/weights.js',
    './assets/modules/features/Ai.js',
    './assets/modules/features/Backtest.js',
    './assets/modules/features/Check.js',
    './assets/modules/features/DataIO.js',
    './assets/modules/features/Generator.js',
    './assets/modules/features/QrScanner.js',
    './assets/modules/features/Stats.js',
    './assets/modules/features/ai/form.js',
    './assets/modules/features/ai/rendering.js',
    './assets/modules/features/backtest/run.js',
    './assets/modules/features/backtest/ui.js',
    './assets/modules/features/dataio/importExport.js',
    './assets/modules/features/dataio/postImportRefresh.js',
    './assets/modules/features/dataio/support.js',
    './assets/modules/features/generator/actions.js',
    './assets/modules/features/generator/form.js',
    './assets/styles/tokens.css',
    './assets/styles/layout.css',
    './assets/styles/components.css',
    './assets/styles/pages.css',
    './assets/styles/modals.css',
    './assets/styles/responsive.css',
    './assets/vendor/pretendard/PretendardVariable.woff2',
    './assets/vendor/qrcode/qrcode.min.js',
    './assets/vendor/html2canvas/html2canvas.min.js',
    './assets/vendor/html5-qrcode/html5-qrcode.min.js',
    './assets/vendor/html5-qrcode/third_party/zxing-js.umd.js',
    './assets/vendor/phosphor/src/regular/style.css',
    './assets/vendor/phosphor/src/regular/Phosphor.woff2',
    './assets/vendor/phosphor/src/regular/Phosphor.woff',
    './assets/vendor/phosphor/src/regular/Phosphor.ttf',
    './assets/vendor/phosphor/src/regular/Phosphor.svg',
    './assets/vendor/phosphor/src/bold/style.css',
    './assets/vendor/phosphor/src/bold/Phosphor-Bold.woff2',
    './assets/vendor/phosphor/src/bold/Phosphor-Bold.woff',
    './assets/vendor/phosphor/src/bold/Phosphor-Bold.ttf',
    './assets/vendor/phosphor/src/bold/Phosphor-Bold.svg',
    './assets/vendor/phosphor/src/fill/style.css',
    './assets/vendor/phosphor/src/fill/Phosphor-Fill.woff2',
    './assets/vendor/phosphor/src/fill/Phosphor-Fill.woff',
    './assets/vendor/phosphor/src/fill/Phosphor-Fill.ttf',
    './assets/vendor/phosphor/src/fill/Phosphor-Fill.svg',
    './assets/vendor/phosphor/src/thin/style.css',
    './assets/vendor/phosphor/src/thin/Phosphor-Thin.woff2',
    './assets/vendor/phosphor/src/thin/Phosphor-Thin.woff',
    './assets/vendor/phosphor/src/thin/Phosphor-Thin.ttf',
    './assets/vendor/phosphor/src/thin/Phosphor-Thin.svg',
    './assets/vendor/phosphor/src/light/style.css',
    './assets/vendor/phosphor/src/light/Phosphor-Light.woff2',
    './assets/vendor/phosphor/src/light/Phosphor-Light.woff',
    './assets/vendor/phosphor/src/light/Phosphor-Light.ttf',
    './assets/vendor/phosphor/src/light/Phosphor-Light.svg',
    './assets/vendor/phosphor/src/duotone/style.css',
    './assets/vendor/phosphor/src/duotone/Phosphor-Duotone.woff2',
    './assets/vendor/phosphor/src/duotone/Phosphor-Duotone.woff',
    './assets/vendor/phosphor/src/duotone/Phosphor-Duotone.ttf',
    './assets/vendor/phosphor/src/duotone/Phosphor-Duotone.svg'
];

const DATA_CORE_ASSETS = [
    './data/winning_stats.json'
];

self.addEventListener('message', (event) => {
    if (event.data?.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

async function safePrecache() {
    const appShellCache = await caches.open(CACHE_APP_SHELL);
    const dataCache = await caches.open(CACHE_DATA);
    const jobs = [
        ...APP_SHELL_ASSETS.map(async (url) => {
            try {
                await appShellCache.add(url);
            } catch (e) {
                // Ignore individual failures to avoid install rejection
            }
        }),
        ...DATA_CORE_ASSETS.map(async (url) => {
            try {
                await dataCache.add(url);
            } catch (e) {
                // Ignore individual failures to avoid install rejection
            }
        })
    ];
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
    return new Response('오프라인', { status: 503, statusText: '오프라인' });
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
