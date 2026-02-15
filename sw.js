const CACHE_NAME = 'lotto-pro-v1';
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
    './assets/modules/utils/utils.js',
    './assets/modules/features/Generator.js',
    './assets/modules/features/Stats.js',
    './assets/modules/features/Ai.js',
    './assets/modules/features/Check.js',
    './assets/modules/features/DataIO.js',
    './assets/modules/features/Backtest.js',
    './assets/modules/features/QrScanner.js',
    './assets/backtest.worker.js',
    './data/winning_stats.json'
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
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
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
