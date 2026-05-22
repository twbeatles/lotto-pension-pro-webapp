import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do';
const DEFAULT_OUTPUT_PATH = resolve('data/pension720_stats.json');
const __filename = fileURLToPath(import.meta.url);

function normalizeDate(rawValue = '') {
    const raw = String(rawValue ?? '').trim();
    const normalized = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return normalized;
}

function normalizeSixDigits(rawValue = '') {
    const text = String(rawValue ?? '').trim();
    if (!/^\d{6}$/.test(text)) return null;
    return {
        number: text,
        digits: text.split('').map(Number)
    };
}

function normalizePension720Item(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const drawNo = Number(raw.draw_no ?? raw.psltEpsd);
    if (!Number.isInteger(drawNo) || drawNo < 1) return null;

    const group = Number(raw.group ?? raw.wnBndNo);
    if (!Number.isInteger(group) || group < 1 || group > 5) return null;

    const primary = normalizeSixDigits(raw.number ?? raw.wnRnkVl);
    const bonus = normalizeSixDigits(raw.bonus_number ?? raw.bnsRnkVl);
    const date = normalizeDate(raw.date ?? raw.psltRflYmd);
    if (!primary || !bonus || !date) return null;

    return {
        draw_no: drawNo,
        date,
        group,
        digits: primary.digits,
        number: primary.number,
        bonus_digits: bonus.digits,
        bonus_number: bonus.number
    };
}

function extractList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data?.result)) return payload.data.result;
    if (Array.isArray(payload?.result)) return payload.result;
    return [];
}

function normalizePayload(payload) {
    const map = new Map();
    extractList(payload).forEach((item) => {
        const normalized = normalizePension720Item(item);
        if (!normalized) return;
        map.set(normalized.draw_no, normalized);
    });
    return Array.from(map.values()).sort((a, b) => b.draw_no - a.draw_no);
}

async function fetchOfficialPayload() {
    const response = await fetch(SOURCE_URL, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 lotto-pension-pro-webapp data sync'
        }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

function validateRows(rows) {
    if (!Array.isArray(rows) || !rows.length) {
        throw new Error('pension720_stats.json must contain at least one draw row');
    }
    rows.forEach((row, index) => {
        const normalized = normalizePension720Item(row);
        if (!normalized) throw new Error(`invalid pension720 row at index ${index}`);
        if (normalized.number !== row.number || normalized.bonus_number !== row.bonus_number) {
            throw new Error(`pension720 row at index ${index} must preserve six-digit strings`);
        }
    });
}

function buildLatestSummary(rows) {
    const normalized = normalizePayload(rows);
    validateRows(normalized);
    const latest = normalized[0];
    return {
        rows: normalized,
        count: normalized.length,
        latestDrawNo: latest.draw_no,
        latestDate: latest.date,
        latestNumber: `${latest.group}조 ${latest.number}`,
        latestGroup: latest.group,
        latestPrimary: latest.number,
        latestBonus: latest.bonus_number
    };
}

function comparePension720Freshness(staticRows, officialRows) {
    const local = buildLatestSummary(staticRows);
    const official = buildLatestSummary(officialRows);
    const issues = [];

    if (official.latestDrawNo > local.latestDrawNo) {
        issues.push(`static data is behind official latest draw ${official.latestDrawNo}`);
    }
    if (official.latestDrawNo < local.latestDrawNo) {
        issues.push(`official latest draw ${official.latestDrawNo} is behind static data ${local.latestDrawNo}`);
    }

    if (official.latestDrawNo === local.latestDrawNo) {
        const latestLocal = local.rows[0];
        const latestOfficial = official.rows[0];
        const fields = ['date', 'group', 'number', 'bonus_number'];
        fields.forEach((field) => {
            if (latestLocal[field] !== latestOfficial[field]) {
                issues.push(`latest draw ${field} mismatch: static=${latestLocal[field]} official=${latestOfficial[field]}`);
            }
        });
    }

    return {
        ok: issues.length === 0,
        static: {
            count: local.count,
            latestDrawNo: local.latestDrawNo,
            latestDate: local.latestDate,
            latestNumber: local.latestNumber,
            latestBonus: local.latestBonus
        },
        official: {
            count: official.count,
            latestDrawNo: official.latestDrawNo,
            latestDate: official.latestDate,
            latestNumber: official.latestNumber,
            latestBonus: official.latestBonus
        },
        issues
    };
}

function renderNumberArray(items = []) {
    return `[${items.map((item) => Number(item)).join(', ')}]`;
}

function renderPension720Rows(rows = []) {
    const blocks = rows.map((row) =>
        [
            '  {',
            `    "draw_no": ${row.draw_no},`,
            `    "date": ${JSON.stringify(row.date)},`,
            `    "group": ${row.group},`,
            `    "digits": ${renderNumberArray(row.digits)},`,
            `    "number": ${JSON.stringify(row.number)},`,
            `    "bonus_digits": ${renderNumberArray(row.bonus_digits)},`,
            `    "bonus_number": ${JSON.stringify(row.bonus_number)}`,
            '  }'
        ].join('\n')
    );
    return `[\n${blocks.join(',\n')}\n]\n`;
}

async function readExistingRows(outputPath) {
    const raw = await readFile(outputPath, 'utf8');
    return JSON.parse(raw);
}

async function main() {
    const checkOnly = process.argv.includes('--check');
    const checkOnline = process.argv.includes('--check-online');
    const outputFlagIndex = process.argv.indexOf('--out');
    const outputPath =
        outputFlagIndex >= 0 && process.argv[outputFlagIndex + 1]
            ? resolve(process.argv[outputFlagIndex + 1])
            : DEFAULT_OUTPUT_PATH;

    if (checkOnline) {
        const result = comparePension720Freshness(await readExistingRows(outputPath), await fetchOfficialPayload());
        console.log(
            JSON.stringify(
                {
                    ok: result.ok,
                    outputPath,
                    sourceUrl: SOURCE_URL,
                    static: result.static,
                    official: result.official,
                    issues: result.issues,
                    checkedOnline: true
                },
                null,
                2
            )
        );
        if (!result.ok) {
            throw new Error(`pension720 freshness check failed: ${result.issues.join('; ')}`);
        }
        return;
    }

    const rows = checkOnly ? await readExistingRows(outputPath) : normalizePayload(await fetchOfficialPayload());
    validateRows(rows);

    const latest = rows[0];
    console.log(
        JSON.stringify(
            {
                ok: true,
                outputPath,
                count: rows.length,
                latestDrawNo: latest.draw_no,
                latestDate: latest.date,
                latestNumber: `${latest.group}조 ${latest.number}`,
                latestBonus: latest.bonus_number,
                checkedOnly: checkOnly
            },
            null,
            2
        )
    );

    if (!checkOnly) {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, renderPension720Rows(rows), 'utf8');
    }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

export { comparePension720Freshness, normalizePension720Item, normalizePayload, renderPension720Rows, SOURCE_URL };
