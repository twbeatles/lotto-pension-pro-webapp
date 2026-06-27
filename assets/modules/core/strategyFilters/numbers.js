export function countConsecutivePairs(numbers) {
    let pairs = 0;
    for (let i = 0; i < numbers.length - 1; i++) {
        if (numbers[i + 1] === numbers[i] + 1) pairs++;
    }
    return pairs;
}

export function toSortedUniqueNumbers(numbers, assumeSorted = false) {
    if (!Array.isArray(numbers) || numbers.length !== 6) return null;
    const sorted = assumeSorted ? numbers : [...numbers].sort((a, b) => a - b);

    for (let i = 0; i < sorted.length; i++) {
        const n = Number(sorted[i]);
        if (!Number.isInteger(n) || n < 1 || n > 45) return null;
        if (i > 0 && n === Number(sorted[i - 1])) return null;
        if (!assumeSorted) sorted[i] = n;
    }
    return sorted;
}

export function bitCount10(mask) {
    let n = mask;
    let count = 0;
    while (n) {
        n &= n - 1;
        count++;
    }
    return count;
}