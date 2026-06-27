function updateHash(hash, value) {
    const text = String(value ?? '');
    let nextHash = hash >>> 0;
    for (let index = 0; index < text.length; index += 1) {
        nextHash ^= text.charCodeAt(index);
        nextHash = Math.imul(nextHash, 16777619) >>> 0;
    }
    return nextHash >>> 0;
}

export function createStatsFingerprint(statsData = []) {
    if (!Array.isArray(statsData) || !statsData.length) return '';
    let hash = 2166136261;
    statsData.forEach((row) => {
        const parts = [
            Number(row?.draw_no || 0),
            String(row?.date || ''),
            ...(Array.isArray(row?.numbers) ? row.numbers : []).map(Number),
            Number(row?.bonus || 0)
        ];
        parts.forEach((part) => {
            hash = updateHash(hash, part);
            hash = updateHash(hash, '|');
        });
        hash = updateHash(hash, ';');
    });
    return `${statsData.length}:${hash.toString(16).padStart(8, '0')}`;
}