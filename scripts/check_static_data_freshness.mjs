import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { estimateLatestDrawKST } from '../assets/modules/utils/utils.js';

const DEFAULT_ALLOWED_BEHIND_BY = 1;
const DATA_PATH = resolve('data/winning_stats.json');
const isStrict = process.argv.includes('--strict');
const allowedBehindBy = isStrict ? 0 : DEFAULT_ALLOWED_BEHIND_BY;

function latestDrawNo(rows = []) {
    return rows.reduce((max, row) => {
        const drawNo = Math.floor(Number(row?.draw_no || 0));
        return Number.isFinite(drawNo) ? Math.max(max, drawNo) : max;
    }, 0);
}

const raw = await readFile(DATA_PATH, 'utf8');
const rows = JSON.parse(raw);
if (!Array.isArray(rows) || !rows.length) {
    throw new Error('winning_stats.json must contain at least one draw row');
}

const latestStatic = latestDrawNo(rows);
const estimatedLatest = estimateLatestDrawKST();
const behindBy = Math.max(0, estimatedLatest - latestStatic);

console.log(
    `static data freshness${isStrict ? ' (strict)' : ''}: latest ${latestStatic} / estimated ${estimatedLatest} / behind ${behindBy}`
);

if (behindBy > allowedBehindBy) {
    throw new Error(
        `static winning data is ${behindBy} draw(s) behind the estimated latest draw. Allowed budget is ${allowedBehindBy}.`
    );
}
