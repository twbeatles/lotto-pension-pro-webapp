import { AdvancedMonteCarlo } from '../MonteCarlo.js';

function createMatrix(size) {
    return Array.from({ length: size }, () => Array(size).fill(0));
}

function getNumbers(draw) {
    return (draw?.numbers || [])
        .map(Number)
        .filter((n) => n >= 1 && n <= 45)
        .sort((a, b) => a - b);
}

function summarizeSeries(series = []) {
    if (!Array.isArray(series) || !series.length) {
        return { mean: 0, median: 0, std: 1, min: 0, max: 0 };
    }

    const sorted = [...series].sort((a, b) => a - b);
    const mean = sorted.reduce((acc, value) => acc + value, 0) / sorted.length;
    const median =
        sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];
    const variance = sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / sorted.length;
    const std = Math.sqrt(variance);

    return {
        mean,
        median,
        std: std > 0 ? std : Math.max((sorted[sorted.length - 1] - sorted[0]) / 4, 1),
        min: sorted[0],
        max: sorted[sorted.length - 1]
    };
}

export const strategyContextMethods = {
    buildContext(sourceData, lookbackWindow = 20, options = {}) {
        const inputData = Array.isArray(sourceData) ? sourceData : [];
        const data = options.sourceDataSorted
            ? inputData
            : [...inputData].sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
        const totalDraws = data.length;
        const normalizedLookback = Math.max(1, Math.floor(Number(lookbackWindow) || 20));
        const recent = data.slice(-normalizedLookback);
        const recentDrawCount = recent.length;
        const freq = Array(46).fill(0);
        const recentFreq = Array(46).fill(0);
        const lastSeen = Array(46).fill(-1);
        const pendingGap = Array(46).fill(totalDraws || 0);
        const averageGap = Array(46).fill(0);
        const pairCounts = Array(46).fill(0);
        const recentPairCounts = Array(46).fill(0);
        const pairMatrix = createMatrix(46);
        const recentPairMatrix = createMatrix(46);
        const endDigitRecent = Array(10).fill(0);
        const zoneRecent = [0, 0, 0];
        const appearanceIndexes = Array.from({ length: 46 }, () => []);
        const drawSums = [];
        const drawAcs = [];
        const recentSums = [];
        const recentAcs = [];

        data.forEach((draw, idx) => {
            const nums = getNumbers(draw);
            if (!nums.length) return;

            drawSums.push(AdvancedMonteCarlo.calculateSum(nums));
            drawAcs.push(AdvancedMonteCarlo.calculateAC(nums));

            nums.forEach((n) => {
                freq[n] += 1;
                lastSeen[n] = idx;
                appearanceIndexes[n].push(idx);
            });

            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    const a = nums[i];
                    const b = nums[j];
                    pairCounts[a] += 1;
                    pairCounts[b] += 1;
                    pairMatrix[a][b] += 1;
                    pairMatrix[b][a] += 1;
                }
            }
        });

        recent.forEach((draw) => {
            const nums = getNumbers(draw);
            if (!nums.length) return;

            recentSums.push(AdvancedMonteCarlo.calculateSum(nums));
            recentAcs.push(AdvancedMonteCarlo.calculateAC(nums));

            nums.forEach((n) => {
                recentFreq[n] += 1;
                endDigitRecent[n % 10] += 1;
                if (n <= 15) zoneRecent[0] += 1;
                else if (n <= 30) zoneRecent[1] += 1;
                else zoneRecent[2] += 1;
            });

            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    const a = nums[i];
                    const b = nums[j];
                    recentPairCounts[a] += 1;
                    recentPairCounts[b] += 1;
                    recentPairMatrix[a][b] += 1;
                    recentPairMatrix[b][a] += 1;
                }
            }
        });

        for (let n = 1; n <= 45; n++) {
            const indexes = appearanceIndexes[n];
            if (!indexes.length) {
                averageGap[n] = totalDraws > 0 ? totalDraws : normalizedLookback;
                pendingGap[n] = totalDraws > 0 ? totalDraws : 0;
                continue;
            }

            if (indexes.length === 1) {
                averageGap[n] = Math.max(totalDraws / indexes.length, 1);
            } else {
                let gapSum = 0;
                for (let i = 1; i < indexes.length; i++) {
                    gapSum += indexes[i] - indexes[i - 1];
                }
                averageGap[n] = Math.max(gapSum / (indexes.length - 1), 1);
            }

            pendingGap[n] = Math.max(totalDraws - 1 - indexes[indexes.length - 1], 0);
        }

        let pairMatrixMax = 1;
        let recentPairMatrixMax = 1;
        for (let a = 1; a <= 45; a++) {
            for (let b = a + 1; b <= 45; b++) {
                pairMatrixMax = Math.max(pairMatrixMax, pairMatrix[a][b]);
                recentPairMatrixMax = Math.max(recentPairMatrixMax, recentPairMatrix[a][b]);
            }
        }

        const lastDraw = totalDraws ? getNumbers(data[totalDraws - 1]) : [];

        return {
            totalDraws,
            lookbackWindow: normalizedLookback,
            recentDrawCount,
            freq,
            recentFreq,
            lastSeen,
            pendingGap,
            averageGap,
            pairCounts,
            recentPairCounts,
            pairMatrix,
            recentPairMatrix,
            pairMatrixMax,
            recentPairMatrixMax,
            endDigitRecent,
            zoneRecent,
            lastDraw,
            drawSums,
            drawAcs,
            recentSums,
            recentAcs,
            drawSumStats: summarizeSeries(drawSums),
            drawAcStats: summarizeSeries(drawAcs),
            recentSumStats: summarizeSeries(recentSums),
            recentAcStats: summarizeSeries(recentAcs)
        };
    }
};
