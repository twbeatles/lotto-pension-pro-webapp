import { StrategyEngine } from './modules/core/StrategyEngine.js';
import { resolveStrategyId } from './modules/core/StrategyCatalog.js';

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === 'START') {
        try {
            await runBacktest(payload || {});
        } catch (err) {
            console.error(err);
            self.postMessage({
                type: 'ERROR',
                payload: {
                    code: 'BACKTEST_RUNTIME_ERROR',
                    message: err.message || 'Backtest runtime error'
                }
            });
        }
    }
};

function toCanonicalRequest(input) {
    if (input && typeof input === 'object' && input.strategyId) {
        return {
            ...input,
            strategyId: resolveStrategyId(input.strategyId),
            params: {
                simulationCount: 5000,
                lookbackWindow: 20,
                wheelPoolSize: null,
                wheelGuarantee: null,
                seed: null,
                ...(input.params || {})
            },
            filters: {
                ...(input.filters || {})
            }
        };
    }

    const strategyId = resolveStrategyId(typeof input === 'string' ? input : 'random');
    return {
        strategyId,
        params: {
            simulationCount: 5000,
            lookbackWindow: 20,
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: null
        },
        filters: {}
    };
}

function getStrategyRequests(payload = {}) {
    if (Array.isArray(payload.strategyRequests) && payload.strategyRequests.length > 0) {
        return payload.strategyRequests.map((x) => toCanonicalRequest(x));
    }
    if (payload.strategyRequest) {
        return [toCanonicalRequest(payload.strategyRequest)];
    }
    return [toCanonicalRequest(payload.strategy || 'random')];
}

function createReport(strategyId) {
    return {
        strategyId,
        draws: 0,
        tickets: 0,
        cost: 0,
        totalPrize: 0,
        counts: [0, 0, 0, 0, 0, 0]
    };
}

function summarizeReport(report) {
    const winCount = report.counts[1] + report.counts[2] + report.counts[3] + report.counts[4] + report.counts[5];
    const roi = report.cost > 0 ? ((report.totalPrize - report.cost) / report.cost) * 100 : 0;
    const hitRate = report.tickets > 0 ? (winCount / report.tickets) * 100 : 0;
    return {
        ...report,
        winCount,
        roi,
        hitRate
    };
}

async function runBacktest({ statsData = [], startDraw, endDraw, qty, strategyRequest, strategy, strategyRequests }) {
    const allStats = [...statsData].sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
    const drawMap = new Map();
    allStats.forEach((d) => drawMap.set(Number(d.draw_no), d));

    const requests = getStrategyRequests({ strategyRequest, strategy, strategyRequests });
    const strategyDrawTotal = Math.max(0, Number(endDraw) - Number(startDraw) + 1);
    const totalDraws = strategyDrawTotal * requests.length;
    const ticketQty = Math.max(1, Math.floor(Number(qty) || 1));

    const startAt = Date.now();
    let processedTotal = 0;
    const strategyProgress = requests.map((req) => ({ strategyId: req.strategyId, draws: 0 }));
    const comparisons = [];

    for (let reqIndex = 0; reqIndex < requests.length; reqIndex++) {
        const req = requests[reqIndex];
        const report = createReport(req.strategyId);
        const winsBuffer = [];

        for (let currentDraw = Number(startDraw); currentDraw <= Number(endDraw); currentDraw++) {
            const historyData = allStats.filter((d) => Number(d.draw_no) < currentDraw);
            const actualResult = drawMap.get(currentDraw);
            if (!actualResult) {
                processedTotal++;
                strategyProgress[reqIndex].draws++;
                continue;
            }

            const engine = new StrategyEngine(historyData);
            let tickets = engine.generateMultipleSets(ticketQty, req, {
                sourceData: historyData,
                maxAttempts: ticketQty * 120
            });

            if (!Array.isArray(tickets) || tickets.length === 0) {
                tickets = [];
                for (let i = 0; i < ticketQty; i++) tickets.push(generateRandomNums());
            }

            for (const ticket of tickets) {
                const { rank, prize } = engine.evaluateTicketSet(ticket, actualResult);
                report.tickets++;
                report.cost += 1000;
                report.totalPrize += prize;
                report.counts[rank]++;

                if (rank >= 1 && rank <= 5) {
                    winsBuffer.push({
                        strategyId: req.strategyId,
                        drawNo: currentDraw,
                        rank,
                        prize,
                        nums: ticket,
                        hitText: ''
                    });
                }
            }

            report.draws++;
            processedTotal++;
            strategyProgress[reqIndex].draws++;

            if (processedTotal % 5 === 0 || processedTotal === totalDraws) {
                const elapsed = Date.now() - startAt;
                const avg = processedTotal > 0 ? elapsed / processedTotal : 0;
                const remaining = Math.max(totalDraws - processedTotal, 0);
                const etaMs = Math.max(Math.round(avg * remaining), 0);

                self.postMessage({
                    type: 'PROGRESS',
                    payload: {
                        summary: report,
                        processedDraws: processedTotal,
                        totalDraws,
                        etaMs,
                        strategyProgress: strategyProgress.map((x) => ({ ...x }))
                    }
                });

                if (winsBuffer.length > 0) {
                    self.postMessage({ type: 'WINS', payload: [...winsBuffer] });
                    winsBuffer.length = 0;
                }
            }
        }

        comparisons.push(summarizeReport(report));
    }

    const sorted = [...comparisons].sort((a, b) => b.roi - a.roi);
    const winner = sorted[0]?.strategyId || null;

    self.postMessage({
        type: 'DONE',
        payload: {
            summary: comparisons[0] || createReport(requests[0]?.strategyId || 'random_baseline'),
            comparisons,
            diagnostics: {
                elapsedMs: Date.now() - startAt,
                processedDraws: processedTotal,
                totalDraws,
                winner
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
