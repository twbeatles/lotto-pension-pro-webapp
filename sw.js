const CACHE_NAME = 'lotto-pro-v3.2';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './assets/app.css',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/modules/index.js',
    './assets/modules/core/LottoApp.js',
    './assets/modules/core/DataManager.js',
    './assets/modules/core/UIManager.js',
    './assets/modules/core/MonteCarlo.js',
    './assets/modules/utils/utils.js',
    './assets/modules/utils/config.js',
    './assets/modules/features/Generator.js',
    './assets/modules/features/Stats.js',
    './assets/modules/features/Ai.js',
    './assets/modules/features/Check.js',
    './assets/modules/features/DataIO.js',
    './assets/modules/features/Backtest.js',
    './assets/modules/features/QrScanner.js',
    './assets/backtest.worker.js',
    './data/winning_stats.json',
    // External Libraries (CDN)
    'https://unpkg.com/@phosphor-icons/web',
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
    'https://unpkg.com/html5-qrcode',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Strategy: Network First for Data (JSON) & API
    if (url.pathname.endsWith('.json') || url.searchParams.has('url')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Update cache with fresh data if successful
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if offline
                    return caches.match(event.request);
                })
        );
    } else {
        // Strategy: Cache First for Static Assets (CSS, JS, Images)
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});

// Activate Event (Cleanup old caches)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
});
