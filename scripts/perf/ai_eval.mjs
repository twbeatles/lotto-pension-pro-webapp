import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StrategyEngine } from '../../assets/modules/core/StrategyEngine.js';
import { listStrategies } from '../../assets/modules/core/StrategyCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv = []) {
    const out = {
        start: 1100,
        end: 1209,
        setCount: 5,
        simulationCount: 5000,
        lookbackWindow: 20,
        seed: 2026,
        includeExperimental: false,
        strategies: null
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--start' && next) {
            out.start = Number(next);
            i++;
            continue;
        }
        if (arg === '--end' && next) {
            out.end = Number(next);
            i++;
            continue;
        }
        if (arg === '--set-count' && next) {
            out.setCount = Number(next);
            i++;
            continue;
        }
        if (arg === '--simulation-count' && next) {
            out.simulationCount = Number(next);
            i++;
            continue;
        }
        if (arg === '--lookback' && next) {
            out.lookbackWindow = Number(next);
            i++;
            continue;
        }
        if (arg === '--seed' && next) {
            out.seed = Number(next);
            i++;
            continue;
        }
        if (arg === '--strategies' && next) {
            out.strategies = next.split(',').map((item) => item.trim()).filter(Boolean);
            i++;
            continue;
        }
        if (arg === '--include-experimental') {
            out.includeExperimental = true;
        }
    }

    return out;
}

function loadStats() {
    const raw = fs.readFileSync(path.join(repoRoot, 'data', 'winning_stats.json'), 'utf8');
    return JSON.parse(raw).sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
}

function getStrategyIds(args) {
    if (Array.isArray(args.strategies) && args.strategies.length) {
        return args.strategies;
    }
    return listStrategies({ includeExperimental: args.includeExperimental, scope: 'ai' }).map((item) => item.id);
}

function rankTicket(ticket, draw) {
    const winSet = new Set(draw.numbers || []);
    let hit = 0;
    let hasBonus = false;

    ticket.forEach((n) => {
        if (winSet.has(n)) hit++;
        if (n === draw.bonus) hasBonus = true;
    });

    if (hit === 6) return 1;
    if (hit === 5 && hasBonus) return 2;
    if (hit === 5) return 3;
    if (hit === 4) return 4;
    if (hit === 3) return 5;
    return 0;
}

function createRequest(strategyId, args) {
    return {
        strategyId,
        params: {
            simulationCount: Math.max(1000, Math.floor(Number(args.simulationCount) || 5000)),
            lookbackWindow: Math.max(5, Math.floor(Number(args.lookbackWindow) || 20)),
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: Number.isFinite(Number(args.seed)) ? Number(args.seed) : null
        },
        filters: {}
    };
}

function evaluateStrategy(strategyId, stats, args, drawIndex) {
    let draws = 0;
    let totalSets = 0;
    let totalHitCount = 0;
    let totalBestHit = 0;
    let rank4plusDraws = 0;
    let rank3plusDraws = 0;
    let rank5plusDraws = 0;
    const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (let drawNo = args.start; drawNo <= args.end; drawNo++) {
        const idx = drawIndex.get(drawNo);
        if (!Number.isFinite(idx) || idx <= 0) continue;

        const history = stats.slice(0, idx);
        const actual = stats[idx];
        const engine = new StrategyEngine(history);
        const request = createRequest(strategyId, args);
        const result = engine.recommendFromSimulation(request, { setCount: args.setCount });
        const sets = Array.isArray(result?.sets) ? result.sets : [];
        if (!sets.length) continue;

        draws++;
        totalSets += sets.length;

        let bestHit = 0;
        for (const set of sets) {
            const hitCount = set.reduce((acc, value) => acc + (actual.numbers.includes(value) ? 1 : 0), 0);
            totalHitCount += hitCount;
            bestHit = Math.max(bestHit, hitCount);
            const rank = rankTicket(set, actual);
            if (rank >= 1 && rank <= 5) {
                rankCounts[rank] += 1;
            }
        }

        totalBestHit += bestHit;
        if (bestHit >= 4) rank4plusDraws++;
        if (bestHit >= 3) rank3plusDraws++;
        if (bestHit >= 5) rank5plusDraws++;
    }

    return {
        strategyId,
        draws,
        avgSets: Number((totalSets / Math.max(draws, 1)).toFixed(2)),
        avgHitPerSet: Number((totalHitCount / Math.max(totalSets, 1)).toFixed(4)),
        avgBestHit: Number((totalBestHit / Math.max(draws, 1)).toFixed(4)),
        drawRateBest4Plus: Number(((rank4plusDraws / Math.max(draws, 1)) * 100).toFixed(2)),
        drawRateBest3Plus: Number(((rank3plusDraws / Math.max(draws, 1)) * 100).toFixed(2)),
        drawRateBest5Plus: Number(((rank5plusDraws / Math.max(draws, 1)) * 100).toFixed(2)),
        rankCounts
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const stats = loadStats();
    const drawIndex = new Map();
    stats.forEach((draw, idx) => drawIndex.set(Number(draw.draw_no), idx));
    const strategyIds = getStrategyIds(args);
    const rows = strategyIds.map((strategyId) => evaluateStrategy(strategyId, stats, args, drawIndex));

    rows.sort((a, b) => {
        const byBestHit = Number(b.avgBestHit || 0) - Number(a.avgBestHit || 0);
        if (byBestHit !== 0) return byBestHit;
        const byFourPlus = Number(b.drawRateBest4Plus || 0) - Number(a.drawRateBest4Plus || 0);
        if (byFourPlus !== 0) return byFourPlus;
        return String(a.strategyId).localeCompare(String(b.strategyId));
    });

    const report = {
        range: { start: args.start, end: args.end },
        setCount: args.setCount,
        simulationCount: args.simulationCount,
        lookbackWindow: args.lookbackWindow,
        includeExperimental: args.includeExperimental,
        strategies: rows
    };

    console.log(JSON.stringify(report, null, 2));
}

main();
