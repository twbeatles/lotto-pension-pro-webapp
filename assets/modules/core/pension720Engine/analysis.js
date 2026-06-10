function buildPension720Analysis(sourceData = []) {
    const rows = (Array.isArray(sourceData) ? sourceData : []).filter(Boolean);
    const groupStats = new Map();
    const positionStats = Array.from({ length: 6 }, () => Array(10).fill(1));
    const bonusPositionStats = Array.from({ length: 6 }, () => Array(10).fill(1));
    const digitGapStats = Array.from({ length: 6 }, () => Array(10).fill(0));
    const latestDrawNo = rows.at(-1)?.draw_no || 0;

    for (let group = 1; group <= 5; group++) {
        groupStats.set(group, {
            group,
            count: 0,
            rawCount: 0,
            recentCount: 0,
            lastSeenDrawNo: 0,
            score: 1,
            gap: 0
        });
    }

    rows.forEach((draw, index) => {
        const recencyWeight = 1 + index / Math.max(1, rows.length - 1);
        const group = groupStats.get(draw.group);
        group.rawCount += 1;
        group.count = group.rawCount;
        group.lastSeenDrawNo = draw.draw_no;
        group.score += recencyWeight;
        if (index >= Math.max(0, rows.length - 20)) {
            group.recentCount += 1;
            group.score += 0.8;
        }

        draw.digits.forEach((digit, pos) => {
            positionStats[pos][digit] += recencyWeight;
        });
        draw.bonus_digits.forEach((digit, pos) => {
            bonusPositionStats[pos][digit] += recencyWeight;
        });
    });

    for (let pos = 0; pos < 6; pos++) {
        for (let digit = 0; digit <= 9; digit++) {
            const lastSeen = [...rows].reverse().find((draw) => draw.digits[pos] === digit)?.draw_no || 0;
            digitGapStats[pos][digit] = latestDrawNo && lastSeen ? latestDrawNo - lastSeen : rows.length;
        }
    }

    groupStats.forEach((group) => {
        const gap = latestDrawNo && group.lastSeenDrawNo ? latestDrawNo - group.lastSeenDrawNo : rows.length;
        group.gap = gap;
        group.score += Math.min(10, gap * 0.35);
    });

    return {
        latestDrawNo,
        drawCount: rows.length,
        groupStats: Array.from(groupStats.values()).sort((a, b) => b.score - a.score),
        positionStats,
        bonusPositionStats,
        digitGapStats
    };
}

export { buildPension720Analysis };
