function countOverlap(left = [], right = []) {
    const rightSet = new Set(right);
    return left.reduce((acc, value) => acc + (rightSet.has(value) ? 1 : 0), 0);
}

function pickDiverseCandidates(candidates = [], setCount = 5) {
    const selected = [];
    const overlapCaps = setCount > 3 ? [3, 4, 5] : [4, 5];

    for (const cap of overlapCaps) {
        for (const candidate of candidates) {
            if (selected.length >= setCount) break;
            if (selected.some((item) => item.key === candidate.key)) continue;
            if (selected.every((item) => countOverlap(item.set, candidate.set) <= cap)) {
                selected.push(candidate);
            }
        }
        if (selected.length >= setCount) break;
    }

    if (selected.length < setCount) {
        for (const candidate of candidates) {
            if (selected.length >= setCount) break;
            if (selected.some((item) => item.key === candidate.key)) continue;
            selected.push(candidate);
        }
    }

    return selected.slice(0, setCount);
}

export { countOverlap, pickDiverseCandidates };