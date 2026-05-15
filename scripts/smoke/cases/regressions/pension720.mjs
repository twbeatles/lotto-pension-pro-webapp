import {
    assert,
    buildBackupPayload,
    DataManager,
    normalizeBackupPayload,
    Pension720Engine,
    readFile,
    resolve
} from './support.mjs';
import { buildPrecacheManifest } from '../../../generate_sw_manifest.mjs';
import { comparePension720Freshness } from '../../../fetch_pension720_stats.mjs';

function makeSamplePensionStats() {
    return [
        {
            draw_no: 3,
            date: '2026-05-14',
            group: 2,
            digits: [5, 3, 7, 5, 3, 0],
            number: '537530',
            bonus_digits: [3, 5, 8, 1, 2, 7],
            bonus_number: '358127'
        },
        {
            draw_no: 2,
            date: '2026-05-07',
            group: 2,
            digits: [0, 6, 0, 7, 2, 7],
            number: '060727',
            bonus_digits: [2, 9, 3, 1, 6, 0],
            bonus_number: '293160'
        },
        {
            draw_no: 1,
            date: '2026-04-30',
            group: 5,
            digits: [7, 2, 6, 4, 9, 3],
            number: '726493',
            bonus_digits: [8, 8, 2, 0, 3, 3],
            bonus_number: '882033'
        }
    ];
}

function runPension720NormalizationRegression() {
    const dm = new DataManager();
    const normalized = dm.normalizePension720DrawItem({
        psltEpsd: 314,
        psltRflYmd: '20260507',
        wnBndNo: '2',
        wnRnkVl: '060727',
        bnsRnkVl: '293160'
    });

    assert.equal(normalized.draw_no, 314, 'pension720 draw number must normalize');
    assert.equal(normalized.date, '2026-05-07', 'pension720 yyyymmdd date must normalize');
    assert.equal(normalized.group, 2, 'pension720 group must normalize');
    assert.equal(normalized.number, '060727', 'pension720 primary number must preserve leading zero');
    assert.deepEqual(normalized.digits, [0, 6, 0, 7, 2, 7], 'pension720 digits must include zeroes');
    assert.equal(
        dm.normalizePension720DrawItem({ ...normalized, group: 6 }),
        null,
        'invalid pension720 group rejected'
    );
}

function runPension720RecommendationRegression() {
    const engine = new Pension720Engine(makeSamplePensionStats());
    const first = engine.recommend({ setCount: 3, profile: 'basic', seed: 720 });
    const second = engine.recommend({ setCount: 3, profile: 'basic', seed: 720 });

    assert.equal(first.length, 3, 'pension720 recommendation must return requested count');
    assert.deepEqual(first, second, 'pension720 seeded recommendation must be reproducible');
    first.forEach((item) => {
        assert.match(item.number, /^\d{6}$/, 'pension720 recommendation must be a six-digit string');
        assert.ok(item.group >= 1 && item.group <= 5, 'pension720 recommendation group must be in range');
        assert.ok(Array.isArray(item.expansionGroups), 'pension720 recommendation must expose expansion groups');
    });
}

function runPension720TicketDedupeRegression() {
    const dm = new DataManager();
    dm.save = () => {};

    const first = dm.addPension720Ticket({ group: 2, number: '060727', source: 'recommendation' });
    const second = dm.addPension720Ticket({ group: 2, number: '060727', source: 'recommendation' });
    const bulk = dm.addPension720TicketsBulk([
        { group: 1, number: '060727', source: 'recommendation' },
        { group: 2, number: '060727', source: 'recommendation' },
        { group: 3, number: '060727', source: 'recommendation' }
    ]);

    assert.equal(first.inserted, true, 'first pension720 save must insert');
    assert.equal(second.duplicate, true, 'duplicate pension720 save must be reported');
    assert.equal(bulk.inserted, 2, 'pension720 expansion save must dedupe existing group/number');
    assert.equal(bulk.duplicate, 1, 'pension720 expansion save must report existing duplicate group/number');
    assert.equal(bulk.truncated, 0, 'pension720 expansion save must not report truncation under cap');
    assert.equal(dm.state.pension720Tickets.length, 3, 'pension720 tickets must keep unique group/number rows');
}

function runPension720TicketCapRegression() {
    const dm = new DataManager();
    dm.save = () => {};
    dm.state.pension720Tickets = Array.from({ length: 1000 }, (_, index) => ({
        id: `old_${index}`,
        group: (index % 5) + 1,
        number: String(index).padStart(6, '0'),
        source: 'recommendation',
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
    }));

    const result = dm.addPension720TicketsBulk([
        { group: 5, number: '999999', source: 'recommendation', createdAt: '2026-05-15T00:00:00.000Z' },
        { group: 1, number: '000000', source: 'recommendation', createdAt: '2026-05-15T00:00:01.000Z' }
    ]);

    assert.equal(result.inserted, 1, 'pension720 bulk save must count accepted new keys at cap');
    assert.equal(result.duplicate, 1, 'pension720 bulk save must report existing duplicate keys at cap');
    assert.equal(result.truncated, 1, 'pension720 bulk save must report cap truncation');
    assert.equal(dm.state.pension720Tickets.length, 1000, 'pension720 bulk save must keep max ticket cap');
    assert.ok(
        dm.state.pension720Tickets.some((ticket) => ticket.number === '999999'),
        'accepted new pension720 ticket must be retained'
    );
}

function runPension720BackupV4Regression() {
    const payload = buildBackupPayload({
        theme: 'dark',
        pension720Tickets: [
            { id: 'p720_a', group: 2, number: '060727', source: 'recommendation' },
            { id: 'p720_b', group: 2, number: '060727', source: 'recommendation' },
            { id: 'p720_c', group: 5, number: '537530', source: 'recommendation' }
        ]
    });
    const normalizedV4 = normalizeBackupPayload(payload);
    const normalizedV3 = normalizeBackupPayload({ ...payload, version: 3, pension720Tickets: undefined });

    assert.equal(payload.version, 4, 'pension720 backup must use v4');
    assert.equal(normalizedV4.pension720Tickets.length, 2, 'pension720 backup must dedupe tickets');
    assert.equal(normalizedV4.pension720Tickets[0].number.length, 6, 'pension720 backup must preserve six digits');
    assert.deepEqual(normalizedV3.pension720Tickets, [], 'backup v3 must remain compatible without pension720 data');
}

async function runPension720StaticDataRegression() {
    const raw = await readFile(resolve(process.cwd(), 'data/pension720_stats.json'), 'utf8');
    const rows = JSON.parse(raw);
    const dm = new DataManager();
    const normalized = dm.normalizePension720Stats(rows);

    assert.ok(normalized.length >= 300, 'pension720 static data must include historical draws');
    assert.ok(normalized[0].draw_no >= 315, 'pension720 static data latest draw must not regress below 2026-05-14 snapshot');
    assert.equal(normalized.find((row) => row.draw_no === 314)?.number, '060727', 'static data must preserve zeroes');
}

function runPension720FreshnessComparisonRegression() {
    const rows = makeSamplePensionStats();
    const ok = comparePension720Freshness(rows, rows);
    const stale = comparePension720Freshness(rows.slice(1), rows);
    const mismatch = comparePension720Freshness(rows, [{ ...rows[0], number: '111111' }, ...rows.slice(1)]);

    assert.equal(ok.ok, true, 'pension720 online freshness comparison must pass matching snapshots');
    assert.equal(stale.ok, false, 'pension720 online freshness comparison must fail stale static data');
    assert.equal(mismatch.ok, false, 'pension720 online freshness comparison must fail latest draw mismatches');
}

function runPension720LatestCheckRegression() {
    const dm = new DataManager();
    const draw = {
        draw_no: 315,
        date: '2026-05-14',
        group: 2,
        number: '537530',
        bonus_number: '358127'
    };

    const cases = [
        [{ group: 2, number: '537530' }, 1, 'primary', 7],
        [{ group: 5, number: '537530' }, 2, 'primary', 6],
        [{ group: 1, number: '358127' }, 'bonus', 'bonus', 6],
        [{ group: 1, number: '037530' }, 3, 'primary', 5],
        [{ group: 1, number: '007530' }, 4, 'primary', 4],
        [{ group: 1, number: '000530' }, 5, 'primary', 3],
        [{ group: 1, number: '000030' }, 6, 'primary', 2],
        [{ group: 1, number: '000000' }, 7, 'primary', 1],
        [{ group: 1, number: '123456' }, 0, 'none', 0]
    ];

    cases.forEach(([ticket, rank, matchType, trailingMatches]) => {
        const result = dm.evaluatePension720Ticket(ticket, draw);
        assert.equal(result.rank, rank, `pension720 check rank mismatch for ${ticket.number}`);
        assert.equal(result.matchType, matchType, `pension720 check match type mismatch for ${ticket.number}`);
        assert.equal(
            result.trailingMatches,
            trailingMatches,
            `pension720 check trailing matches mismatch for ${ticket.number}`
        );
    });
}

async function runPension720UiContractRegression() {
    const [indexSource, featureSource, dataIoSupportSource] = await Promise.all([
        readFile(resolve(process.cwd(), 'index.html'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/modules/features/Pension720.js'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/modules/features/dataio/support.js'), 'utf8')
    ]);

    assert.match(indexSource, /pension720CopyAllBtn/, 'pension720 UI must expose copy-all action');
    assert.match(indexSource, /pension720ExportCsvBtn/, 'pension720 UI must expose CSV export action');
    assert.match(indexSource, /pension720CheckLatestBtn/, 'pension720 UI must expose latest-check action');
    assert.match(indexSource, /저장 번호 기준 참고 확인이며 실물\/공식 확인이 필요합니다/, 'pension720 check disclaimer must stay visible');
    assert.match(featureSource, /UIManager\.confirm/, 'pension720 clear-all must require confirmation');
    assert.match(featureSource, /lastRecommendationOptions/, 'pension720 recommendations must remember generation options');
    assert.match(featureSource, /copyText/, 'pension720 saved tickets must use generic text copy');
    assert.match(featureSource, /lotto_pension_pro_pension720_tickets_/, 'pension720 CSV filename must be rebranded');
    assert.match(dataIoSupportSource, /lotto_pension_pro_backup_v4/, 'backup export filename prefix must be rebranded');
}

async function runPension720BackupFixtureRegression() {
    const raw = await readFile(resolve(process.cwd(), 'scripts/smoke/fixtures/backup_v4_pension720.json'), 'utf8');
    const normalized = JSON.parse(raw);
    const payload = buildBackupPayload(normalized);
    const roundtrip = normalizeBackupPayload(payload);

    assert.equal(normalized.version, 4, 'pension720 backup fixture must be v4');
    assert.equal(roundtrip.pension720Tickets.length, 2, 'pension720 backup fixture must roundtrip saved tickets');
    assert.equal(roundtrip.pension720Tickets[0]?.number, '060727', 'pension720 fixture must preserve leading zeroes');
}

async function runPension720PrecacheRegression() {
    const manifest = await buildPrecacheManifest();
    assert.ok(
        manifest.data.includes('./data/pension720_stats.json'),
        'pension720 static data must be in SW data precache manifest'
    );
}

export {
    runPension720BackupV4Regression,
    runPension720BackupFixtureRegression,
    runPension720FreshnessComparisonRegression,
    runPension720LatestCheckRegression,
    runPension720NormalizationRegression,
    runPension720PrecacheRegression,
    runPension720RecommendationRegression,
    runPension720StaticDataRegression,
    runPension720TicketCapRegression,
    runPension720TicketDedupeRegression,
    runPension720UiContractRegression
};
