import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DataManager } from '../assets/modules/core/DataManager.js';
import { estimateLatestDrawKST } from '../assets/modules/utils/utils.js';

const DEFAULT_DATA_PATH = resolve('data/winning_stats.json');
const __filename = fileURLToPath(import.meta.url);

function normalizeRows(rows = []) {
    const dm = new DataManager();
    const normalized = (Array.isArray(rows) ? rows : []).map((row) => dm.normalizeDrawItem(row)).filter(Boolean);
    if (!normalized.length) throw new Error('winning_stats.json must contain at least one valid draw row');
    return normalized.sort((a, b) => Number(b.draw_no) - Number(a.draw_no));
}

function summarizeRows(rows = []) {
    const normalized = normalizeRows(rows);
    const latest = normalized[0];
    return {
        rows: normalized,
        count: normalized.length,
        latestDrawNo: latest.draw_no,
        latestDate: latest.date,
        latestNumbers: latest.numbers,
        latestBonus: latest.bonus
    };
}

function sameNumberList(left = [], right = []) {
    return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((value, index) => Number(value) === Number(right[index]))
    );
}

function compareLatestDrawFields(localLatest, officialLatest) {
    const issues = [];
    if (localLatest.date !== officialLatest.date) {
        issues.push(`latest draw date mismatch: static=${localLatest.date} official=${officialLatest.date}`);
    }
    if (!sameNumberList(localLatest.numbers, officialLatest.numbers)) {
        issues.push(
            `latest draw numbers mismatch: static=${localLatest.numbers.join(',')} official=${officialLatest.numbers.join(',')}`
        );
    }
    if (Number(localLatest.bonus) !== Number(officialLatest.bonus)) {
        issues.push(`latest draw bonus mismatch: static=${localLatest.bonus} official=${officialLatest.bonus}`);
    }

    ['prize_amount', 'winners_count', 'total_sales'].forEach((field) => {
        if (Number(localLatest[field] || 0) !== Number(officialLatest[field] || 0)) {
            issues.push(`latest draw ${field} mismatch: static=${localLatest[field]} official=${officialLatest[field]}`);
        }
    });

    return issues;
}

function compareLottoOfficialFreshness(staticRows, officialRows, options = {}) {
    const estimatedLatestDrawNo = Math.max(0, Math.floor(Number(options.estimatedLatestDrawNo || estimateLatestDrawKST())));
    const local = summarizeRows(staticRows);
    const official = summarizeRows(officialRows);
    const issues = [];

    if (estimatedLatestDrawNo > local.latestDrawNo) {
        issues.push(`static data is behind estimated latest draw ${estimatedLatestDrawNo}`);
    }
    if (official.latestDrawNo > local.latestDrawNo) {
        issues.push(`static data is behind official draw ${official.latestDrawNo}`);
    }
    if (official.latestDrawNo < local.latestDrawNo) {
        issues.push(`official draw ${official.latestDrawNo} is behind static latest draw ${local.latestDrawNo}`);
    }

    if (official.latestDrawNo === local.latestDrawNo) {
        issues.push(...compareLatestDrawFields(local.rows[0], official.rows[0]));
    }

    return {
        ok: issues.length === 0,
        static: {
            count: local.count,
            latestDrawNo: local.latestDrawNo,
            latestDate: local.latestDate,
            latestNumbers: local.latestNumbers,
            latestBonus: local.latestBonus
        },
        official: {
            count: official.count,
            latestDrawNo: official.latestDrawNo,
            latestDate: official.latestDate,
            latestNumbers: official.latestNumbers,
            latestBonus: official.latestBonus
        },
        estimatedLatestDrawNo,
        issues
    };
}

async function readStaticRows(dataPath = DEFAULT_DATA_PATH) {
    const raw = await readFile(dataPath, 'utf8');
    return JSON.parse(raw);
}

async function fetchOfficialDraw(drawNo) {
    const dm = new DataManager();
    const logs = [];
    const item = await dm.fetchOneDraw(drawNo, { url: '', source: 'built-in' }, (message, code, meta = null) => {
        logs.push({ message, code, meta });
    });
    if (!item) {
        throw new Error(`official lotto draw ${drawNo} could not be fetched`);
    }
    return {
        item,
        logs
    };
}

async function main() {
    const dataPath = DEFAULT_DATA_PATH;
    const staticRows = await readStaticRows(dataPath);
    const latestStatic = summarizeRows(staticRows).rows[0];
    const { item: officialLatest, logs } = await fetchOfficialDraw(latestStatic.draw_no);
    const result = compareLottoOfficialFreshness(staticRows, [officialLatest]);

    console.log(
        JSON.stringify(
            {
                ok: result.ok,
                dataPath,
                static: result.static,
                official: result.official,
                estimatedLatestDrawNo: result.estimatedLatestDrawNo,
                issues: result.issues,
                warnings: logs.filter((entry) => entry.code === 'SYNC_FETCH_ONE_INVALID_PAYLOAD'),
                checkedOnline: true
            },
            null,
            2
        )
    );

    if (!result.ok) {
        throw new Error(`lotto official freshness check failed: ${result.issues.join('; ')}`);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

export { compareLottoOfficialFreshness, fetchOfficialDraw, normalizeRows, readStaticRows, summarizeRows };
