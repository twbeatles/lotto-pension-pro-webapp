import { xorshift32 } from './strategy/shared.js';

function normalizeSixDigitString(value = '') {
    const text = String(value ?? '').trim();
    return /^\d{6}$/.test(text) ? text : '';
}

function normalizeDraw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const drawNo = Number(raw.draw_no);
    const group = Number(raw.group);
    const number = normalizeSixDigitString(raw.number);
    const bonusNumber = normalizeSixDigitString(raw.bonus_number);
    if (!Number.isInteger(drawNo) || drawNo < 1) return null;
    if (!Number.isInteger(group) || group < 1 || group > 5) return null;
    if (!number || !bonusNumber) return null;
    return {
        draw_no: drawNo,
        date: typeof raw.date === 'string' ? raw.date : '',
        group,
        digits: number.split('').map(Number),
        number,
        bonus_digits: bonusNumber.split('').map(Number),
        bonus_number: bonusNumber
    };
}

function weightedPick(items, rng) {
    const safeItems = items.filter((item) => Number(item.weight) > 0);
    const total = safeItems.reduce((sum, item) => sum + Number(item.weight || 0), 0);
    if (!safeItems.length || total <= 0) return items[0]?.value;
    let cursor = rng() * total;
    for (const item of safeItems) {
        cursor -= Number(item.weight || 0);
        if (cursor <= 0) return item.value;
    }
    return safeItems[safeItems.length - 1].value;
}

function clampInt(value, min, max, fallback) {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
}

export class Pension720Engine {
    constructor(stats = []) {
        this.data = (Array.isArray(stats) ? stats : [])
            .map((row) => normalizeDraw(row))
            .filter(Boolean)
            .sort((a, b) => a.draw_no - b.draw_no);
        this.analysis = this.buildAnalysis();
    }

    buildAnalysis() {
        const groupStats = new Map();
        const positionStats = Array.from({ length: 6 }, () => Array(10).fill(1));
        const recentWindow = this.data.slice(-40);
        const latestDrawNo = this.data.at(-1)?.draw_no || 0;

        for (let group = 1; group <= 5; group++) {
            groupStats.set(group, {
                group,
                count: 0,
                rawCount: 0,
                recentCount: 0,
                lastSeenDrawNo: 0,
                score: 1
            });
        }

        this.data.forEach((draw, index) => {
            const recencyWeight = 1 + index / Math.max(1, this.data.length - 1);
            const group = groupStats.get(draw.group);
            group.rawCount += 1;
            group.count = group.rawCount;
            group.lastSeenDrawNo = draw.draw_no;
            group.score += recencyWeight;

            draw.digits.forEach((digit, pos) => {
                positionStats[pos][digit] += recencyWeight;
            });
            draw.bonus_digits.forEach((digit, pos) => {
                positionStats[pos][digit] += recencyWeight * 0.35;
            });
        });

        recentWindow.forEach((draw) => {
            const group = groupStats.get(draw.group);
            group.recentCount += 1;
            group.score += 0.8;
            draw.digits.forEach((digit, pos) => {
                positionStats[pos][digit] += 0.45;
            });
            draw.bonus_digits.forEach((digit, pos) => {
                positionStats[pos][digit] += 0.2;
            });
        });

        groupStats.forEach((group) => {
            const gap = latestDrawNo && group.lastSeenDrawNo ? latestDrawNo - group.lastSeenDrawNo : 0;
            group.gap = gap;
            group.score += Math.min(8, gap * 0.25);
        });

        return {
            latestDrawNo,
            drawCount: this.data.length,
            groupStats: Array.from(groupStats.values()).sort((a, b) => b.score - a.score),
            positionStats
        };
    }

    createRng(seed) {
        const numericSeed = Number(seed);
        if (Number.isFinite(numericSeed) && numericSeed > 0) {
            return xorshift32(Math.floor(numericSeed));
        }
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            return () => {
                const array = new Uint32Array(1);
                crypto.getRandomValues(array);
                return array[0] / 0xffffffff;
            };
        }
        return Math.random;
    }

    pickGroup(rng) {
        return weightedPick(
            this.analysis.groupStats.map((item) => ({
                value: item.group,
                weight: item.score
            })),
            rng
        );
    }

    pickNumber(rng, profile = 'basic') {
        const exploration = profile === 'precise' ? 0.2 : profile === 'fast' ? 0.55 : 0.35;
        return this.analysis.positionStats
            .map((weights) => {
                const items = weights.map((weight, digit) => ({
                    value: digit,
                    weight: 1 + weight * (1 - exploration) + rng() * exploration * 4
                }));
                return weightedPick(items, rng);
            })
            .join('');
    }

    scoreCandidate(group, number) {
        const groupScore = this.analysis.groupStats.find((item) => item.group === group)?.score || 1;
        const digitScore = number.split('').reduce((sum, digit, pos) => {
            return sum + (this.analysis.positionStats[pos]?.[Number(digit)] || 1);
        }, 0);
        return Number((groupScore * 0.28 + digitScore * 0.72).toFixed(4));
    }

    explainCandidate(group, number) {
        const groupMeta = this.analysis.groupStats.find((item) => item.group === group);
        const topPositions = number
            .split('')
            .map((digit, pos) => {
                const weights = this.analysis.positionStats[pos] || [];
                const sortedDigits = weights
                    .map((weight, value) => ({ value, weight }))
                    .sort((a, b) => b.weight - a.weight);
                return sortedDigits[0]?.value === Number(digit) ? `${pos + 1}번째 ${digit}` : '';
            })
            .filter(Boolean)
            .slice(0, 2);

        const reasons = [];
        if (groupMeta) {
            reasons.push(`${group}조 빈도 ${groupMeta.rawCount || 0}회, 최근 공백 ${groupMeta.gap || 0}회`);
        }
        if (topPositions.length) {
            reasons.push(`자리별 강세: ${topPositions.join(', ')}`);
        }
        reasons.push(`최근 ${Math.min(40, this.data.length)}회와 보너스 번호를 보조 반영`);
        return reasons;
    }

    recommend(options = {}) {
        const setCount = clampInt(options.setCount, 1, 20, 5);
        const profile = ['fast', 'basic', 'precise'].includes(options.profile) ? options.profile : 'basic';
        const rng = this.createRng(options.seed);
        const poolSize = profile === 'precise' ? 180 : profile === 'fast' ? 60 : 110;
        const candidates = new Map();

        for (let i = 0; i < poolSize; i++) {
            const group = this.pickGroup(rng);
            const number = this.pickNumber(rng, profile);
            const key = `${group}|${number}`;
            if (candidates.has(key)) continue;
            const score = this.scoreCandidate(group, number);
            const expansionGroups = this.analysis.groupStats
                .filter((item) => item.group !== group)
                .map((item) => item.group);
            candidates.set(key, {
                group,
                number,
                digits: number.split('').map(Number),
                score,
                expansionGroups,
                reasons: this.explainCandidate(group, number)
            });
        }

        return Array.from(candidates.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, setCount);
    }

    getSummary() {
        return {
            latestDrawNo: this.analysis.latestDrawNo,
            drawCount: this.analysis.drawCount,
            topGroups: this.analysis.groupStats.slice(0, 5)
        };
    }
}
