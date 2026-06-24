/* global window, document */

import assert from 'node:assert/strict';
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

async function createReadyPage(context, origin) {
    const page = await context.newPage();
    page.on('pageerror', (error) => {
        throw error;
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.app?.data?.state?.winningStats?.length), null, {
        timeout: 20000
    });
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

async function setGeneratorTargetToCurrentLatest(page) {
    return page.evaluate(() => {
        const latestDrawNo = Number(window.app.data.state.winningStats[0]?.draw_no || 0);
        const targetDraw = document.querySelector('#genTargetDrawNo');
        if (targetDraw && latestDrawNo > 0) {
            targetDraw.value = String(latestDrawNo);
            targetDraw.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return latestDrawNo;
    });
}

async function runGenerateTicketCheckFlow(page) {
    await routeTo(page, 'gen');
    await page.evaluate(() => {
        const setCount = document.querySelector('#setCount');
        const seed = document.querySelector('#genSeed');
        if (setCount) setCount.value = '1';
        if (seed) seed.value = '20260430';
    });
    await setGeneratorTargetToCurrentLatest(page);

    await page.click('#generateBtn');
    await page.waitForSelector('#genResultList .result-item button[data-action="ticket"]', { timeout: 20000 });
    const ticketTargetDrawNo = await setGeneratorTargetToCurrentLatest(page);
    await page.click('#genResultList .result-item button[data-action="ticket"]');
    await page.waitForFunction((expectedDrawNo) => {
        const ticket = window.app.data.state.ticketBook[0];
        return Boolean(ticket?.checked && Number(ticket.targetDrawNo) === Number(expectedDrawNo));
    }, ticketTargetDrawNo);

    await routeTo(page, 'check');
    await page.click('#page-check [data-source="tickets"]');
    await page.waitForSelector('#checkTargetCards .check-target-card');
    await page.click('#doCheckBtn');
    await page.waitForFunction(() => {
        const text = document.querySelector('#checkResultArea')?.textContent || '';
        return /회차|등|낙첨|미당첨/.test(text);
    });
}

async function runAiPickFlow(page) {
    await routeTo(page, 'ai');
    await page.evaluate(() => {
        const simulation = document.querySelector('#aiSimulationCount');
        const seed = document.querySelector('#aiSeed');
        if (simulation) simulation.value = '1000';
        if (seed) seed.value = '20260430';
    });
    await page.click('#aiPredictBtn');
    await page.waitForSelector('#aiOutput .pick-btn', { timeout: 30000 });
    await page.waitForSelector('#aiReproductionCode .reproduction-code-value', { timeout: 5000 });
    await page.click('#aiOutput .pick-btn');
    await routeTo(page, 'gen');
    await page.waitForSelector('#genResultList .result-item');
}

async function runImportFlow(page) {
    await routeTo(page, 'data');
    const payload = {
        version: 3,
        favorites: [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-30T00:00:00.000Z' }],
        history: [{ numbers: [7, 8, 9, 10, 11, 12], date: '2026-04-30T00:00:00.000Z' }],
        ticketBook: [],
        campaigns: [],
        alertPrefs: {},
        settings: {},
        localUpdates: [],
        strategyPresets: []
    };

    await page.setInputFiles('#importInput', {
        name: 'happy-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(payload), 'utf8')
    });
    await page.waitForSelector('#dialogModal.active #dialogConfirmBtn', { timeout: 5000 });
    await page.click('#dialogConfirmBtn');
    await page.waitForFunction(() => {
        return window.app.data.state.favorites.some((item) => (item.numbers || []).join(',') === '1,2,3,4,5,6');
    });
}

async function runPension720Flow(page) {
    await routeTo(page, 'pension720');
    await page.evaluate(() => {
        const count = document.querySelector('#pension720RecommendCount');
        const seed = document.querySelector('#pension720Seed');
        if (count) count.value = '1';
        if (seed) seed.value = '20260519';
    });

    await page.click('#pension720RecommendBtn');
    await page.waitForSelector('#pension720Output [data-p720-action="save"]', { timeout: 30000 });
    await page.click('#pension720Output [data-p720-action="save"]');
    await page.waitForFunction(() => (window.app.data.state.pension720Tickets || []).length >= 1);
    await page.waitForFunction(() => {
        const groupBall = document.querySelector('#pension720SavedList .p720-group');
        return Boolean(groupBall?.textContent?.includes('조'));
    });

    await page.click('#pension720Output [data-p720-action="save-expansion"]');
    await page.waitForFunction(() => (window.app.data.state.pension720Tickets || []).length >= 2);

    await page.evaluate(() => {
        const latestDrawNo = Number(window.app.data.state.pension720Stats?.[0]?.draw_no || 0);
        const startDraw = document.querySelector('#pension720CampaignStartDraw');
        const weeks = document.querySelector('#pension720CampaignWeeks');
        const sets = document.querySelector('#pension720CampaignSetsPerDraw');
        if (startDraw) startDraw.value = String(latestDrawNo + 1);
        if (weeks) weeks.value = '1';
        if (sets) sets.value = '1';
    });
    await page.click('#pension720CampaignBtn');
    await page.waitForFunction(() => {
        return (
            (window.app.data.state.pension720Campaigns || []).length >= 1 &&
            (window.app.data.state.pension720Tickets || []).some((ticket) => ticket.campaignId)
        );
    });

    await page.click('#pension720CheckLatestBtn');
    await page.waitForFunction(() => {
        const text = document.querySelector('#pension720CheckOutput')?.textContent || '';
        return text.includes('참고 비교') && text.includes('대기');
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#pension720ExportCsvBtn');
    const download = await downloadPromise;
    const suggestedFilename = download.suggestedFilename();
    assert.match(
        suggestedFilename,
        /^lotto_pension_pro_pension720_tickets_/,
        'pension720 CSV download filename must use the expected prefix'
    );
    const downloadedPath = await download.path();
    const csv = await fs.readFile(downloadedPath, 'utf8');
    assert.match(csv, /group,number,targetDrawNo/, 'pension720 CSV download must include the expected header');
    assert.match(csv, /\d,\d{6}/, 'pension720 CSV download must include saved ticket rows');
}

async function main() {
    const server = await createStaticServer();
    const browser = await launchBrowser();

    try {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await createReadyPage(context, server.origin);
        await runGenerateTicketCheckFlow(page);
        await runAiPickFlow(page);
        await runImportFlow(page);
        await runPension720Flow(page);
        await context.close();
        console.log(
            JSON.stringify(
                {
                    ok: true,
                    scenarios: [
                        'generate -> ticket -> check',
                        'recommendation -> generator import',
                        'backup import merge',
                        'pension720 recommend -> save -> campaign -> check -> csv'
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
