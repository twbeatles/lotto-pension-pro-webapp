export function createMatrix(size) {
    return Array.from({ length: size }, () => Array(size).fill(0));
}

export function getNumbers(draw) {
    return (draw?.numbers || [])
        .map(Number)
        .filter((n) => n >= 1 && n <= 45)
        .sort((a, b) => a - b);
}

export function summarizeSeries(series = []) {
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