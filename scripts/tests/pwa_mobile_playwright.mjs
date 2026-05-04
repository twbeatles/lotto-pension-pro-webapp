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
                'Cache-Control': 'no-cache'
            });
            res.end(data);
        } catch (_e) {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        origin: `http://127.0.0.1:${address.port}`,
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

async function ensureServiceWorkerControl(page) {
    await page.waitForFunction(() => Boolean(window.app?.data?.state?.winningStats?.length), null, { timeout: 20000 });
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    const hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    if (!hasController) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.app?.data?.state?.winningStats?.length), null, {
            timeout: 20000
        });
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    }
}

async function routeTo(page, target) {
    await page.evaluate(async (nextTarget) => {
        await window.app.route(nextTarget);
    }, target);
    await page.waitForFunction((routeTarget) => {
        return document.querySelector(`#page-${routeTarget}`)?.classList.contains('active') === true;
    }, target);
}

async function readGeneratedNumbers(page) {
    return page.evaluate(() => {
        return [...document.querySelectorAll('#genResultList .result-item .ball')]
            .map((ball) => Number(ball.textContent || 0))
            .filter(Number.isFinite)
            .join(',');
    });
}

async function runUnseededGeneratorTwice(page) {
    await routeTo(page, 'gen');
    await page.evaluate(() => {
        document.querySelector('#setCount').value = '1';
        document.querySelector('#genSeed').value = '';
    });

    await page.click('#generateBtn');
    await page.waitForSelector('#genResultList .result-item .ball');
    const first = await readGeneratedNumbers(page);

    await page.click('#generateBtn');
    await page.waitForFunction((previous) => {
        const next = [...document.querySelectorAll('#genResultList .result-item .ball')]
            .map((ball) => Number(ball.textContent || 0))
            .filter(Number.isFinite)
            .join(',');
        return next && next !== previous;
    }, first);
}

async function runUnseededRecommendationTwice(page) {
    await routeTo(page, 'ai');
    await page.evaluate(() => {
        document.querySelector('#aiSeed').value = '';
        document.querySelector('#aiSimulationCount').value = '1000';
        document.querySelector('#aiLookbackWindow').value = '12';
    });

    await page.click('#aiPredictBtn');
    await page.waitForSelector('#aiOutput .ai-card-row .ball');
    const first = await page.evaluate(() => window.app.data.state.aiResults.map((set) => set.join(',')).join('|'));

    await page.click('#aiPredictBtn');
    await page.waitForFunction((previous) => {
        const next = window.app.data.state.aiResults.map((set) => set.join(',')).join('|');
        return next && next !== previous;
    }, first);
}

async function main() {
    const server = await createStaticServer();
    const browser = await launchBrowser();

    try {
        const context = await browser.newContext({
            viewport: { width: 393, height: 852 },
            deviceScaleFactor: 2.75,
            isMobile: true,
            hasTouch: true,
            userAgent:
                'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
        });
        const page = await context.newPage();
        await page.goto(server.origin, { waitUntil: 'domcontentloaded' });
        await ensureServiceWorkerControl(page);
        await runUnseededGeneratorTwice(page);
        await runUnseededRecommendationTwice(page);
        await context.close();
        console.log(JSON.stringify({ ok: true, scenario: 'android-like pwa unseeded generation and recommendation' }));
    } finally {
        await browser.close();
        await server.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
