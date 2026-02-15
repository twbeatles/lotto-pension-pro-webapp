/**
 * Lotto Pro Backtest Worker
 * Handles heavy simulation tasks in a background thread.
 */

class LegacyPredictor {
    constructor(winningAsc) {
        this.data = Array.isArray(winningAsc) ? winningAsc : [];
    }

    computeScores({ uptoIndexExclusive = null, recencyWindow = 20 } = {}) {
        const upto = (uptoIndexExclusive == null) ? this.data.length : Math.max(0, Math.min(this.data.length, uptoIndexExclusive));
        if (upto <= 0) return Array(46).fill(1.0);

        const freq = Array(46).fill(0);
        // Optimization: Calculate freq only once if possible, but here we scan
        // For performance in rolling simulation, we should use rolling state instead of full scan
        // But for LegacyPredictor 'predictNext' called in loop, we stick to the logic.
        // actually, the backtest loop uses _computeScoresFromState which is different.
        // detailed check: LegacyPredictor is used for "AI" strategy in backtest?

        // In `app.js`, `processBatch` uses `_computeScoresFromState(rolling)` for AI strategy.
        // So we need that logic here.
        return [];
    }

    // Static helper for weighted sampling
    static weightedSample(scores, k = 6) {
        const pool = [];
        const weights = [];
        for (let n = 1; n <= 45; n++) {
            pool.push(n);
            weights.push(Math.max(0, scores[n] || 0));
        }

        const chosen = [];
        for (let i = 0; i < k; i++) {
            if (!pool.length) break;
            const total = weights.reduce((a, b) => a + b, 0);
            let idx = 0;
            if (total <= 0) {
                idx = Math.floor(Math.random() * pool.length);
            } else {
                const r = Math.random() * total;
                let cumulative = 0;
                for (let j = 0; j < weights.length; j++) {
                    cumulative += weights[j];
                    if (cumulative >= r) {
                        idx = j;
                        break;
                    }
                }
            }
            chosen.push(pool[idx]);
            pool.splice(idx, 1);
            weights.splice(idx, 1);
        }

        return chosen.sort((a, b) => a - b);
    }
}

// Internal Rolling State Manager for "AI" Strategy in Backtest
function makeRollingState() {
    return {
        total: 0,
        freq: Array(46).fill(0),
        recentFreq: Array(46).fill(0),
        lastSeen: Array(46).fill(0),
        recentQueue: [] // Array of [numbers...]
    };
}

function ingest(state, numbers, recencyWindow = 20) {
    const idx = state.total;
    state.total += 1;
    numbers.forEach(n => {
        state.freq[n] += 1;
        state.recentFreq[n] += 1;
        state.lastSeen[n] = idx;
    });
    state.recentQueue.push(numbers);
    if (state.recentQueue.length > recencyWindow) {
        const old = state.recentQueue.shift();
        old.forEach(n => { state.recentFreq[n] -= 1; });
    }
}

function computeScoresFromState(state) {
    if (state.total <= 0) return Array(46).fill(1.0);
    const total = state.total;
    const recentCount = Math.max(1, state.recentQueue.length);
    const scores = Array(46).fill(1.0);

    for (let n = 1; n <= 45; n++) {
        const sFreq = state.freq[n] / total;
        const sRecent = (state.recentFreq[n] / recentCount) * 2.0;
        const gap = total - (state.lastSeen[n] || 0);
        const sGap = Math.min(gap / total, 0.3);
        scores[n] = Math.max(sFreq + sRecent + sGap, 0.01);
    }
    return scores;
}

function calcRank(ticketNums, winNums, bonus) {
    const winSet = new Set(winNums);
    const matchCount = ticketNums.filter(n => winSet.has(n)).length;
    const bonusHit = ticketNums.includes(bonus);

    let rank = 0;
    if (matchCount === 6) rank = 1;
    else if (matchCount === 5 && bonusHit) rank = 2;
    else if (matchCount === 5) rank = 3;
    else if (matchCount === 4) rank = 4;
    else if (matchCount === 3) rank = 5;

    const hitText = (rank === 2) ? '5+B' : String(matchCount);
    return { rank, matchCount, bonusHit, hitText };
}

function getEstimatedPrize(rank) {
    if (rank === 1) return 2_000_000_000;
    if (rank === 2) return 50_000_000;
    if (rank === 3) return 1_500_000;
    if (rank === 4) return 50_000;
    if (rank === 5) return 5_000;
    return 0;
}

// Message Handler
self.onmessage = function (e) {
    const { type, payload } = e.data;
    if (type === 'START') {
        runBacktest(payload);
    }
};

async function runBacktest(params) {
    const {
        statsData, // Full winning stats array
        startDraw,
        endDraw,
        qty,
        strategy // 'random' | 'ai'
    } = params;

    // Sort asc
    const asc = statsData.sort((a, b) => a.draw_no - b.draw_no);

    // Filter range
    const valid = asc.filter(d => d.draw_no >= startDraw && d.draw_no <= endDraw);

    // Initialize Simulation State
    const rolling = makeRollingState();

    // Pre-fill rolling state with data BEFORE startDraw to warm up the model
    // (Optional but good for accuracy: ingest everything up to startDraw)
    for (const d of asc) {
        if (d.draw_no < startDraw) {
            ingest(rolling, d.numbers);
        } else {
            break;
        }
    }

    const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalTickets = 0;
    let drawsUsed = 0;
    const costPerTicket = 1000;
    let totalPrize = 0;

    for (const win of valid) {
        drawsUsed++;

        // AI Strategy Calculation
        let scores = null;
        if (strategy === 'ai') {
            scores = computeScoresFromState(rolling);
        }

        const winList = []; // Buffer for wins in this draw to send back

        for (let k = 0; k < qty; k++) {
            let nums;
            if (strategy === 'ai') {
                nums = LegacyPredictor.weightedSample(scores, 6);
            } else {
                // Random
                const pool = Array.from({ length: 45 }, (_, i) => i + 1);
                // Simple shuffle
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                nums = pool.slice(0, 6).sort((a, b) => a - b);
            }

            const r = calcRank(nums, win.numbers, win.bonus);
            counts[r.rank]++;
            totalPrize += getEstimatedPrize(r.rank);
            totalTickets++;

            if (r.rank > 0) {
                winList.push({
                    drawNo: win.draw_no,
                    rank: r.rank,
                    hitText: r.hitText,
                    nums
                });
            }
        }

        // Update rolling state for next draw
        ingest(rolling, win.numbers);

        // Send Progress
        if (drawsUsed % 5 === 0 || drawsUsed === valid.length) {
            self.postMessage({
                type: 'PROGRESS',
                payload: {
                    draws: drawsUsed,
                    tickets: totalTickets,
                    cost: totalTickets * costPerTicket,
                    totalPrize,
                    counts,
                    recentWins: winList.length > 0 ? winList : null
                }
            });
            // Sleep a tiny bit to allow message posting? Not needed in worker usually, but prevents main thread choke if msg flooding
            // await new Promise(r => setTimeout(r, 0));
        } else if (winList.length > 0) {
            // Send wins immediately if any (for better UX)
            self.postMessage({
                type: 'WINS',
                payload: winList
            });
        }
    }

    self.postMessage({
        type: 'DONE',
        payload: {
            draws: drawsUsed,
            tickets: totalTickets,
            cost: totalTickets * costPerTicket,
            totalPrize,
            counts
        }
    });
}
