import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOC_PATHS = ['README.md', 'claude.md', 'gemini.md', 'deploy_github_pages.md'];
const LOTTO_PATH = resolve('data/winning_stats.json');
const PENSION720_PATH = resolve('data/pension720_stats.json');
const __filename = fileURLToPath(import.meta.url);

function latestByDrawNo(rows = []) {
    return [...(Array.isArray(rows) ? rows : [])]
        .filter((row) => Number.isFinite(Number(row?.draw_no)))
        .sort((a, b) => Number(b.draw_no) - Number(a.draw_no))[0];
}

function getDataBaseline(lottoRows, pensionRows) {
    const lottoLatest = latestByDrawNo(lottoRows);
    const pensionLatest = latestByDrawNo(pensionRows);
    if (!lottoLatest) throw new Error('winning_stats.json must contain at least one draw row');
    if (!pensionLatest) throw new Error('pension720_stats.json must contain at least one draw row');

    return {
        lottoLatestDrawNo: Number(lottoLatest.draw_no),
        lottoRows: Array.isArray(lottoRows) ? lottoRows.length : 0,
        pensionLatestDrawNo: Number(pensionLatest.draw_no),
        pensionLatestDate: String(pensionLatest.date || ''),
        pensionLatestPrimary: `${Number(pensionLatest.group || 0)}조 ${String(pensionLatest.number || '')}`,
        pensionLatestBonus: String(pensionLatest.bonus_number || '')
    };
}

function replaceSection(source, startNeedle, endNeedle, updater) {
    const start = source.indexOf(startNeedle);
    if (start < 0) return source;
    const end = source.indexOf(endNeedle, start + startNeedle.length);
    const sectionEnd = end < 0 ? source.length : end;
    const before = source.slice(0, start);
    const section = source.slice(start, sectionEnd);
    const after = source.slice(sectionEnd);
    return `${before}${updater(section)}${after}`;
}

function updateLottoSection(section, baseline) {
    return section
        .replace(/((?:Latest draw|latest draw|최신 회차): `)\d+(`)/g, `$1${baseline.lottoLatestDrawNo}$2`)
        .replace(/((?:Rows|rows|row 수): `)\d+(`)/g, `$1${baseline.lottoRows}$2`);
}

function updatePensionSection(section, baseline) {
    return section
        .replace(/((?:Latest draw|latest draw|최신 회차): `)\d+(`)/g, `$1${baseline.pensionLatestDrawNo}$2`)
        .replace(/((?:Latest date|latest date|최신 날짜): `)[^`]+(`)/g, `$1${baseline.pensionLatestDate}$2`)
        .replace(/((?:Latest primary|latest primary|최신 1등): `)[^`]+(`)/g, `$1${baseline.pensionLatestPrimary}$2`)
        .replace(/((?:Latest bonus|latest bonus|최신 보너스): `)[^`]+(`)/g, `$1${baseline.pensionLatestBonus}$2`);
}

function updateDocSource(source, baseline) {
    let next = source;
    next = replaceSection(next, 'Lotto 6/45 static data', 'Pension720+ static data', (section) =>
        updateLottoSection(section, baseline)
    );
    next = replaceSection(next, 'Lotto 6/45 data', 'Pension720+ data', (section) =>
        updateLottoSection(section, baseline)
    );
    next = replaceSection(next, '- Lotto 6/45:', '- Pension720+:', (section) => updateLottoSection(section, baseline));
    next = replaceSection(next, 'Pension720+ static data', 'Service worker', (section) =>
        updatePensionSection(section, baseline)
    );
    next = replaceSection(next, 'Pension720+ data', 'Service-worker', (section) =>
        updatePensionSection(section, baseline)
    );
    next = replaceSection(next, '- Pension720+:', '\n\n', (section) => updatePensionSection(section, baseline));
    return next;
}

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
    const checkOnly = process.argv.includes('--check');
    const baseline = getDataBaseline(await readJson(LOTTO_PATH), await readJson(PENSION720_PATH));
    const changed = [];

    for (const docPath of DOC_PATHS) {
        const absolute = resolve(docPath);
        const source = await readFile(absolute, 'utf8');
        const next = updateDocSource(source, baseline);
        if (next !== source) {
            changed.push(docPath);
            if (!checkOnly) {
                await writeFile(absolute, next, 'utf8');
            }
        }
    }

    console.log(
        JSON.stringify(
            {
                ok: changed.length === 0 || !checkOnly,
                checkOnly,
                changed,
                baseline
            },
            null,
            2
        )
    );

    if (checkOnly && changed.length) {
        throw new Error(`documentation data baseline is stale: ${changed.join(', ')}`);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

export { getDataBaseline, updateDocSource };
