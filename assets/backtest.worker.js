import { StrategyEngine } from './modules/core/StrategyEngine.js';
import { resolveStrategyId } from './modules/core/StrategyCatalog.js';

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === 'START') {
        try {
            await runBacktest(payload);
        } catch (err) {
            console.error(err);
            self.postMessage({
                type: 'ERROR',
                payload: {
                    code: 'BACKTEST_RUNTIME_ERROR',
                    message: err.message || 'Backtest runtime error',
                    strategyId: resolveStrategyId(payload?.strategyRequest?.strategyId || payload?.strategy || 'random')
                }
            });
        }
    }
};

async function runBacktest({ statsData, startDraw, endDraw, qty, strategyRequest, strategy }) {
    const totalDraws = endDraw - startDraw + 1;
    let processed = 0;
    const startAt = Date.now();
    const canonicalStrategyRequest = strategyRequest || {
        strategyId: resolveStrategyId(strategy || 'random'),
        params: { simulationCount: 5000, lookbackWindow: 20, wheelPoolSize: null, wheelGuarantee: null, seed: null },
        filters: {}
    };
    const strategyId = resolveStrategyId(canonicalStrategyRequest.strategyId || strategy || 'random');

    // Sort data just in case
    const allStats = [...statsData].sort((a, b) => a.draw_no - b.draw_no);

    // Quick lookup for actual results
    const drawMap = new Map();
    allStats.forEach(d => drawMap.set(d.draw_no, d));

    const report = {
        draws: 0,
        tickets: 0,
        cost: 0,
        totalPrize: 0,
        counts: [0, 0, 0, 0, 0, 0] // 0:Fail, 1:1st, 2:2nd ...
    };

    const wins = [];

    for (let currentDraw = startDraw; currentDraw <= endDraw; currentDraw++) {
        // 1. Prepare historical data (up to currentDraw - 1)
        // We need data strictly BEFORE the current draw to simulate prediction
        const historyData = allStats.filter(d => d.draw_no < currentDraw);

        // If we don't have enough history, maybe skip or use what we have?
        // Ideally we need at least some history.

        const actualResult = drawMap.get(currentDraw);
        if (!actualResult) {
            // Data missing for this draw? Skip.
            processed++;
            continue;
        }

        // 2. Generate Numbers (same rule as UI strategy engine)
        const engine = new StrategyEngine(historyData);
        let tickets = engine.generateMultipleSets(qty, canonicalStrategyRequest, { sourceData: historyData, maxAttempts: qty * 120 });
        if (!Array.isArray(tickets) || tickets.length === 0) {
            tickets = [];
            for (let i = 0; i < qty; i++) tickets.push(generateRandomNums());
        }

        // 3. Check Wins
        const winNums = actualResult.numbers; // [1,2,3,4,5,6]
        const bonus = actualResult.bonus;     // 7

        tickets.forEach(ticket => {
            const { rank, prize } = checkRank(ticket, winNums, bonus);

            report.tickets++;
            report.cost += 1000;
            report.totalPrize += prize;
            report.counts[rank]++; // rank 0 is fail

            if (rank >= 1 && rank <= 5) { // Track 5th place or better
                wins.push({
                    drawNo: currentDraw,
                    rank,
                    prize,
                    nums: ticket,
                    hitText: '' // Can be generated in UI
                });
            }
        });

        report.draws++;
        processed++;

        // Progress Update every 5 draws or last one
        if (processed % 5 === 0 || processed === totalDraws) {
            const elapsed = Date.now() - startAt;
            const avg = processed > 0 ? (elapsed / processed) : 0;
            const remaining = Math.max(totalDraws - processed, 0);
            const etaMs = Math.max(Math.round(avg * remaining), 0);
            self.postMessage({
                type: 'PROGRESS',
                payload: {
                    summary: report,
                    processedDraws: processed,
                    totalDraws,
                    etaMs,
                    strategyId
                }
            });
            // Send batch of wins to avoid spamming
            if (wins.length > 0) {
                // For performance, we might want to send wins only occasionally or all at once?
                // UI appends rows. Let's send them.
                self.postMessage({ type: 'WINS', payload: [...wins] });
                wins.length = 0; // Clear buffer
            }
        }
    }

    // Final Done message
    self.postMessage({
        type: 'DONE',
        payload: {
            summary: report,
            diagnostics: {
                elapsedMs: Date.now() - startAt,
                processedDraws: processed,
                totalDraws,
                strategyId
            }
        }
    });
}

function generateRandomNums() {
    const nums = new Set();
    while (nums.size < 6) {
        nums.add(Math.floor(Math.random() * 45) + 1);
    }
    return [...nums].sort((a, b) => a - b);
}

function checkRank(myNums, winNums, bonus) {
    let hit = 0;
    let hasBonus = false;

    myNums.forEach(n => {
        if (winNums.includes(n)) hit++;
        if (n === bonus) hasBonus = true;
    });

    if (hit === 6) return { rank: 1, prize: 2000000000 }; // Est. 2B
    if (hit === 5 && hasBonus) return { rank: 2, prize: 50000000 }; // Est. 50M
    if (hit === 5) return { rank: 3, prize: 1500000 }; // Est. 1.5M
    if (hit === 4) return { rank: 4, prize: 50000 };
    if (hit === 3) return { rank: 5, prize: 5000 };
    return { rank: 0, prize: 0 };
}
