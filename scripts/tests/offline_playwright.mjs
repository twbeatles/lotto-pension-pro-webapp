/* global window, document */

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function getContentType(filePath) {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function createStaticServer() {
    const server = http.createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const relativePath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
            const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
            const resolvedPath = path.resolve(repoRoot, `.${safePath}`);
            if (!resolvedPath.startsWith(repoRoot)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            const data = await fs.readFile(resolvedPath);
            res.writeHead(200, {
                'Content-Type': getContentType(resolvedPath),
                'Cache-Control': requestUrl.pathname.endsWith('/online-check.txt') ? 'no-store' : 'no-cache'
            });
            res.end(data);
        } catch (_e) {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    return {
        origin,
        async close() {
            await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
    };
}

async function launchBrowser() {
    const launchCandidates =
        process.platform === 'win32' ? [{ channel: 'msedge' }, { channel: 'chrome' }, {}] : [{ channel: 'chrome' }, {}];
    const errors = [];

    for (const candidate of launchCandidates) {
        try {
            return await chromium.launch({
                ...candidate,
                headless: true
            });
        } catch (error) {
            errors.push(`${candidate.channel || 'bundled'}: ${error.message}`);
        }
    }

    throw new Error(`Playwright browser launch failed. Tried: ${errors.join(' | ')}`);
}

async function waitForApp(page) {
    await page.waitForFunction(() => Boolean(window.app?.data?.state));
}

async function ensureServiceWorkerControl(page) {
    await waitForApp(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker));
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    const hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    if (!hasController) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForApp(page);
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    }
}

async function createReadyPage(context, origin) {
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await ensureServiceWorkerControl(page);
    return page;
}

async function routeTo(page, target) {
    await page.evaluate(async (nextTarget) => {
        await window.app.route(nextTarget);
    }, target);
    await page.waitForFunction((routeTarget) => {
        return document.querySelector(`#page-${routeTarget}`)?.classList.contains('active') === true;
    }, target);
}

async function expectOfflineBanner(page) {
    await page.waitForFunction(() => {
        const banner = document.querySelector('#offlineBanner');
        return Boolean(banner && banner.hidden === false);
    });
}

async function expectGate(page, routeId) {
    await page.waitForFunction((target) => {
        return Boolean(document.querySelector(`#page-${target} .data-health-gate`));
    }, routeId);
}

async function expectNoGate(page, routeId) {
    await page.waitForFunction((target) => {
        return !document.querySelector(`#page-${target} .data-health-gate`);
    }, routeId);
}

async function runMultiTabSyncScenario(browser, origin) {
    const context = await browser.newContext();
    const pageA = await createReadyPage(context, origin);
    const pageB = await createReadyPage(context, origin);

    await routeTo(pageB, 'data');
    await pageA.evaluate(() => {
        window.app.data.addTicket([1, 2, 3, 4, 5, 6], {
            source: 'import',
            targetDrawNo: 1300
        });
    });
    await pageB.waitForFunction(() => window.app.data.state.ticketBook.length === 1);

    await pageA.evaluate(() => {
        const ticketId = window.app.data.state.ticketBook[0]?.id;
        if (ticketId) window.app.data.removeTicket(ticketId);
    });
    await pageB.waitForFunction(() => window.app.data.state.ticketBook.length === 0);

    await context.close();
}

async function runOfflineCachedScenario(browser, origin) {
    const context = await browser.newContext();
    const page = await createReadyPage(context, origin);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await expectOfflineBanner(page);

    await routeTo(page, 'bt');
    await expectNoGate(page, 'bt');
    await routeTo(page, 'data');
    await expectNoGate(page, 'data');

    await context.close();
}

async function runOfflineGateScenario(browser, origin) {
    const context = await browser.newContext();
    const page = await createReadyPage(context, origin);

    await page.evaluate(() => {
        localStorage.removeItem('lotto_pro_updates_v2');
        window.app.data.localUpdatesCache = null;
    });

    await context.setOffline(true);
    await expectOfflineBanner(page);
    await page.evaluate(async () => {
        const originalFetchWithTimeout = window.app.data.fetchWithTimeout?.bind(window.app.data);
        window.app.data.fetchWithTimeout = async (resource, options) => {
            if (String(resource || '').includes('data/winning_stats.json')) {
                throw new Error('forced-offline-static-miss');
            }
            if (typeof originalFetchWithTimeout === 'function') {
                return originalFetchWithTimeout(resource, options);
            }
            return fetch(resource, options);
        };
        await window.app.data.fetchWinningStats({ notifyTicketSettle: false, preserveExistingOnFailure: false });
        await window.app.refreshCurrentRoute();
    });

    await routeTo(page, 'gen');
    await expectNoGate(page, 'gen');

    await routeTo(page, 'data');
    await expectNoGate(page, 'data');

    await routeTo(page, 'stats');
    await expectGate(page, 'stats');

    await routeTo(page, 'ai');
    await expectGate(page, 'ai');

    await routeTo(page, 'bt');
    await expectGate(page, 'bt');

    await routeTo(page, 'check');
    await page.waitForFunction(() => {
        return Boolean(document.querySelector('#page-check .data-health-banner'));
    });

    await context.close();
}

async function main() {
    const server = await createStaticServer();
    const browser = await launchBrowser();

    try {
        await runMultiTabSyncScenario(browser, server.origin);
        await runOfflineCachedScenario(browser, server.origin);
        await runOfflineGateScenario(browser, server.origin);
        console.log(
            JSON.stringify(
                {
                    ok: true,
                    scenarios: [
                        'multi-tab ticket sync',
                        'offline cached lazy-route access',
                        'offline gated partial-data routes'
                    ]
                },
                null,
                2
            )
        );
    } finally {
        await browser.close();
        await server.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
