import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { estimateLatestDrawKST } from '../assets/modules/utils/utils.js';

const ALLOWED_BEHIND_BY = 1;
const DATA_PATH = resolve('data/winning_stats.json');

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
    `static data freshness: 내 데이터 ${latestStatic}회 / 예상 최신 ${estimatedLatest}회 / 차이 ${behindBy}회`
);

if (behindBy > ALLOWED_BEHIND_BY) {
    throw new Error(
        `정적 당첨 데이터가 ${behindBy}회차 뒤처져 있습니다. 허용치는 ${ALLOWED_BEHIND_BY}회차입니다.`
    );
}
