import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

import { estimateLatestDrawKST } from '../assets/modules/utils/utils.js';

const execFileAsync = promisify(execFile);
const DATA_PATH = resolve('data/winning_stats.json');

function latestDrawNo(rows = []) {
    return rows.reduce((max, row) => {
        const drawNo = Math.floor(Number(row?.draw_no || 0));
        return Number.isFinite(drawNo) ? Math.max(max, drawNo) : max;
    }, 0);
}

async function readLatestStaticDrawNo() {
    const rows = JSON.parse(await readFile(DATA_PATH, 'utf8'));
    if (!Array.isArray(rows) || !rows.length) {
        throw new Error('winning_stats.json must contain at least one draw row');
    }
    return latestDrawNo(rows);
}

async function runNodeScript(scriptPath, args = [], options = {}) {
    const command = process.execPath;
    const commandArgs = [scriptPath, ...args];
    try {
        const result = await execFileAsync(command, commandArgs, {
            cwd: process.cwd(),
            maxBuffer: 1024 * 1024 * 16
        });
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        return { ok: true, result };
    } catch (error) {
        if (error.stdout) process.stdout.write(error.stdout);
        if (error.stderr) process.stderr.write(error.stderr);
        if (!options.allowFailure) throw error;
        return { ok: false, error };
    }
}

async function setGithubOutput(name, value) {
    if (!process.env.GITHUB_OUTPUT) return;
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
}

async function main() {
    const estimatedLatestDrawNo = estimateLatestDrawKST();
    const latestBefore = await readLatestStaticDrawNo();
    let deferred = false;
    let deferredReason = '';

    await runNodeScript('scripts/fetch_pension720_stats.mjs');

    if (estimatedLatestDrawNo > latestBefore) {
        const lottoSync = await runNodeScript(
            'scripts/sync_lotto_stats.mjs',
            ['--target', String(estimatedLatestDrawNo)],
            { allowFailure: true }
        );
        if (!lottoSync.ok) {
            const scheduledCheck = await runNodeScript(
                'scripts/check_lotto_official_freshness.mjs',
                ['--defer-estimated-missing'],
                { allowFailure: true }
            );
            if (!scheduledCheck.ok) {
                throw lottoSync.error;
            }
            deferred = true;
            deferredReason = `estimated Lotto draw ${estimatedLatestDrawNo} is not published by the official endpoint yet`;
        }
    } else {
        await runNodeScript('scripts/check_lotto_official_freshness.mjs', ['--defer-estimated-missing']);
    }

    if (!deferred) {
        await runNodeScript('scripts/generate_sw_manifest.mjs');
        await runNodeScript('scripts/update_docs_data_baseline.mjs');
    }

    const latestAfter = await readLatestStaticDrawNo();
    const summary = {
        ok: true,
        deferred,
        deferredReason,
        estimatedLatestDrawNo,
        latestBefore,
        latestAfter
    };

    await setGithubOutput('deferred', deferred ? 'true' : 'false');
    console.log(JSON.stringify(summary, null, 2));
}

main().catch(async (error) => {
    await setGithubOutput('deferred', 'false');
    console.error(error);
    process.exitCode = 1;
});
