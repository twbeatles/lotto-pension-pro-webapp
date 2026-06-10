function digitFrequencyMeta(digits = []) {
    const counts = new Map();
    digits.forEach((digit) => counts.set(digit, (counts.get(digit) || 0) + 1));
    const maxSame = Math.max(0, ...counts.values());
    return {
        uniqueCount: counts.size,
        maxSame
    };
}

function countAdjacentFlow(digits = []) {
    let count = 0;
    for (let i = 1; i < digits.length; i++) {
        if (Math.abs(digits[i] - digits[i - 1]) === 1) count++;
    }
    return count;
}

export { countAdjacentFlow, digitFrequencyMeta };
