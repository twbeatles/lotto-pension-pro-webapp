import {
    assert,
    readFile,
    resolve
} from './support.mjs';
import {
    buildPrecacheManifest,
    renderManifestSource
} from '../../../generate_sw_manifest.mjs';

async function runRuntimeAssetLocalizationRegression() {
    const targets = [
        'index.html',
        'assets/app.css',
        'assets/modules/utils/loader.js'
    ];
    for (const target of targets) {
        const text = await readFile(resolve(process.cwd(), target), 'utf8');
        assert.ok(!/cdn\.jsdelivr\.net|unpkg\.com|@import url\(/.test(text), `${target} must not reference runtime CDN assets`);
    }
}

async function runServiceWorkerReloadPolicyRegression() {
    const pwaSource = await readFile(resolve(process.cwd(), 'assets/modules/bootstrap/pwa.js'), 'utf8');
    assert.match(pwaSource, /let reloadOnControllerChange = false;/, 'SW script must gate reloads behind explicit update acceptance');
    assert.match(
        pwaSource,
        /navigator\.serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/,
        'SW registration must bypass stale HTTP cache when checking for updates'
    );
    assert.match(pwaSource, /reloadOnControllerChange = true;/, 'update acceptance must arm controllerchange reload');
    assert.match(pwaSource, /if \(refreshing \|\| !reloadOnControllerChange\) return;/, 'controllerchange must ignore first-install activation');
    assert.match(
        pwaSource,
        /if \(e\.data\?\.type === 'SW_ACTIVATED' && e\.data\?\.senderId !== channelClientId\)/,
        'remote tabs must reload only after activation-complete broadcast from another tab'
    );
    assert.match(
        pwaSource,
        /updateChannel\?\.postMessage\(\{ type: 'SW_ACTIVATED', senderId: channelClientId \}\);/,
        'activation-complete broadcast must happen after controllerchange'
    );
    assert.doesNotMatch(pwaSource, /SW_UPDATED/, 'legacy immediate reload broadcast must be removed');
    assert.match(pwaSource, /if \(reg\.waiting && navigator\.serviceWorker\.controller\) \{\s*showUpdateToast\(reg\.waiting\);/m, 'existing waiting SW must surface the update toast immediately');
    assert.match(pwaSource, /reg\.update\(\)\.catch\(\(\) => \{\}\);/, 'registration flow must proactively check for a newer SW script');
}

async function runServiceWorkerCoreDataPrecacheRegression() {
    const swSource = await readFile(resolve(process.cwd(), 'sw.js'), 'utf8');
    assert.match(swSource, /const CACHE_VERSION = 'v18';/, 'service worker cache version must be bumped');
    assert.match(swSource, /importScripts\('\.\/assets\/sw-precache-manifest\.js'\);/, 'service worker must import the generated precache manifest');
    assert.match(swSource, /const PRECACHE_MANIFEST = self\.__SW_PRECACHE_MANIFEST \|\| FALLBACK_PRECACHE_MANIFEST;/, 'service worker must consume the generated precache manifest');
    assert.match(swSource, /const DATA_CORE_ASSETS = Array\.isArray\(PRECACHE_MANIFEST\.data\)/, 'service worker must read data precache entries from the manifest');
    assert.match(swSource, /const ONLINE_CHECK_PATH_SUFFIX = '\/online-check\.txt';/, 'service worker must reserve the online-check path');
    assert.match(swSource, /if \(url\.pathname\.endsWith\(ONLINE_CHECK_PATH_SUFFIX\)\) return;/, 'service worker must bypass cache handling for the online-check probe path');
    assert.match(swSource, /\.\/data\/winning_stats\.json/, 'winning_stats.json must stay in the precache manifest fallback');
    assert.match(swSource, /const dataCache = await caches\.open\(CACHE_DATA\);/, 'data cache must be opened during install precache');
    assert.match(swSource, /networkFirstWithTimeout\(event\.request, CACHE_DATA, 5000\)/, 'data cache must allow a longer mobile timeout before offline fallback');
    assert.match(swSource, /function isAppShellCodeRequest\(request, url\)/, 'service worker must classify JS/CSS/font assets separately');
    assert.match(swSource, /networkFirstWithTimeout\(event\.request, CACHE_APP_SHELL, 3500\)/, 'app-shell code assets must prefer network-first delivery');
    assert.doesNotMatch(swSource, /__network_probe/, 'service worker must not special-case the deprecated probe route anymore');
}

async function runServiceWorkerManifestParityRegression() {
    const manifestSource = await readFile(resolve(process.cwd(), 'assets/sw-precache-manifest.js'), 'utf8');
    const expectedManifest = await buildPrecacheManifest();

    assert.equal(
        manifestSource.trim(),
        renderManifestSource(expectedManifest).trim(),
        'generated SW precache manifest must stay in sync with the manifest generator'
    );
    assert.doesNotMatch(manifestSource, /online-check\.txt/, 'online-check probe file must stay out of the precache manifest');
}

async function runHiddenAttributeStyleRegression() {
    const layoutSource = await readFile(resolve(process.cwd(), 'assets/styles/layout.css'), 'utf8');
    const htmlSource = await readFile(resolve(process.cwd(), 'index.html'), 'utf8');
    assert.match(
        layoutSource,
        /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
        'hidden elements must stay visually hidden even when inline styles set display'
    );
    assert.match(
        htmlSource,
        /<div id="offlineBanner" hidden aria-hidden="true"/,
        'offline banner must still default to the hidden state in markup'
    );
}

async function runLocalFontPathRegression() {
    const tokensSource = await readFile(resolve(process.cwd(), 'assets/styles/tokens.css'), 'utf8');
    assert.match(
        tokensSource,
        /src:\s*url\('\.\.\/vendor\/pretendard\/PretendardVariable\.woff2'\)/,
        'Pretendard font path must stay relative to the deployed assets/styles directory'
    );
}

export {
    runHiddenAttributeStyleRegression,
    runLocalFontPathRegression,
    runRuntimeAssetLocalizationRegression,
    runServiceWorkerCoreDataPrecacheRegression,
    runServiceWorkerManifestParityRegression,
    runServiceWorkerReloadPolicyRegression
};
