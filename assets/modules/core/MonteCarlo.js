export class AdvancedMonteCarlo {
    constructor() {
        // 유지보수 편의를 위해 생성자는 남겨둔다.
    }

    static weightedSample(weights, k = 6, rng = Math.random) {
        const chosen = new Set();
        const safeWeights = Array.isArray(weights) ? weights : Array(46).fill(1);
        let safety = 0;
        while (chosen.size < k && safety++ < 200) {
            let total = 0;
            for (let i = 1; i <= 45; i++) {
                if (!chosen.has(i)) total += Math.max(0.0001, Number(safeWeights[i] || 1));
            }
            let r = rng() * total;
            for (let i = 1; i <= 45; i++) {
                if (chosen.has(i)) continue;
                r -= Math.max(0.0001, Number(safeWeights[i] || 1));
                if (r <= 0) {
                    chosen.add(i);
                    break;
                }
            }
        }

        if (chosen.size < k) {
            for (let i = 1; i <= 45 && chosen.size < k; i++) chosen.add(i);
        }
        return [...chosen].sort((a, b) => a - b);
    }

    static calculateSum(numbers) {
        return (numbers || []).reduce((a, b) => a + b, 0);
    }

    static calculateAC(numbers) {
        if (!numbers || numbers.length < 6) return 0;
        const diffs = new Set();
        for (let i = 0; i < numbers.length; i++) {
            for (let j = i + 1; j < numbers.length; j++) {
                diffs.add(Math.abs(numbers[i] - numbers[j]));
            }
        }
        return diffs.size - 5;
    }

    static getEndDigits(numbers) {
        return (numbers || []).map((n) => n % 10);
    }
}
