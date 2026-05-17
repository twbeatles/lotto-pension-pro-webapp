import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DataManager } from '../assets/modules/core/DataManager.js';
import { estimateLatestDrawKST } from '../assets/modules/utils/utils.js';
import { CONFIG } from '../assets/modules/utils/config.js';

const DATA_PATH = resolve('data/winning_stats.json');

function parseArgs(argv = process.argv.slice(2)) {
    const args = {
        dryRun: false,
        targetDrawNo: estimateLatestDrawKST()
    };

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--dry-run') {
            args.dryRun = true;
            continue;
        }
        if (value === '--target' && argv[index + 1]) {
            args.targetDrawNo = Number(argv[index + 1]);
            index += 1;
            continue;
        }
        if (/^\d+$/.test(value)) {
            args.targetDrawNo = Number(value);
        }
    }

    args.targetDrawNo = Math.max(1, Math.floor(Number(args.targetDrawNo || 0)));
    return args;
}

function uniqueNormalizedRows(dm, rows = []) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const normalized = dm.normalizeDrawItem(row);
        if (!normalized) return;
        map.set(Number(normalized.draw_no), normalized);
    });
    return [...map.values()].sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
}

function findMissingTargets(rows = [], targetDrawNo = 0) {
    const present = new Set(rows.map((row) => Number(row.draw_no)));
    const allowedMissing = new Set((CONFIG.LIMITS.MISSING_DRAWS || []).map(Number).filter(Number.isFinite));
    const targets = [];
    for (let drawNo = 1; drawNo <= targetDrawNo; drawNo += 1) {
        if (present.has(drawNo) || allowedMissing.has(drawNo)) continue;
        targets.push(drawNo);
    }
    return targets;
}

async function main() {
    const args = parseArgs();
    const dm = new DataManager();
    const raw = await readFile(DATA_PATH, 'utf8');
    const currentRows = uniqueNormalizedRows(dm, JSON.parse(raw));
    const latestStatic = currentRows.at(-1)?.draw_no || 0;
    const targetDrawNo = Math.max(args.targetDrawNo, latestStatic);
    const targets = findMissingTargets(currentRows, targetDrawNo);

    if (!targets.length) {
        console.log(
            JSON.stringify(
                {
                    ok: true,
                    dryRun: args.dryRun,
                    latestStatic,
                    targetDrawNo,
                    fetched: 0,
                    message: 'winning_stats.json is already complete for the requested target'
                },
                null,
                2
            )
        );
        return;
    }

    const fetchedRows = [];
    const failedTargets = [];
    for (const drawNo of targets) {
        const item = await dm.fetchOneDraw(drawNo, { url: '', source: 'built-in' }, () => {});
        if (item) fetchedRows.push(item);
        else failedTargets.push(drawNo);
    }

    const nextRows = uniqueNormalizedRows(dm, [...currentRows, ...fetchedRows]);
    const structure = dm.assessWinningStatsStructure(nextRows);
    const unexpectedMissing = structure.unexpectedMissing.filter((drawNo) => drawNo <= targetDrawNo);

    if (failedTargets.length || unexpectedMissing.length) {
        throw new Error(
            `lotto sync incomplete: failed=${failedTargets.join(',') || '-'} missing=${
                unexpectedMissing.join(',') || '-'
            }`
        );
    }

    if (!args.dryRun) {
        await writeFile(DATA_PATH, `${JSON.stringify(nextRows)}\n`, 'utf8');
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                dryRun: args.dryRun,
                latestBefore: latestStatic,
                latestAfter: nextRows.at(-1)?.draw_no || 0,
                targetDrawNo,
                fetched: fetchedRows.length,
                rows: nextRows.length
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
