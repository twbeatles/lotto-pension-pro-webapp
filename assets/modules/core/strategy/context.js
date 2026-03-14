export const strategyContextMethods = {
    buildContext(sourceData, lookbackWindow = 20) {
        const data = [...(sourceData || [])].sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
        const totalDraws = data.length;
        const recent = data.slice(-lookbackWindow);
        const freq = Array(46).fill(0);
        const recentFreq = Array(46).fill(0);
        const lastSeen = Array(46).fill(-1);
        const pairCounts = Array(46).fill(0);
        const endDigitRecent = Array(10).fill(0);
        const zoneRecent = [0, 0, 0];

        data.forEach((draw, idx) => {
            (draw.numbers || []).forEach((nRaw) => {
                const n = Number(nRaw);
                if (n < 1 || n > 45) return;
                freq[n] += 1;
                lastSeen[n] = idx;
            });
        });

        recent.forEach((draw) => {
            const nums = (draw.numbers || []).map(Number).filter((n) => n >= 1 && n <= 45).sort((a, b) => a - b);
            nums.forEach((n) => {
                recentFreq[n] += 1;
                endDigitRecent[n % 10] += 1;
                if (n <= 15) zoneRecent[0] += 1;
                else if (n <= 30) zoneRecent[1] += 1;
                else zoneRecent[2] += 1;
            });
            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    pairCounts[nums[i]] += 1;
                    pairCounts[nums[j]] += 1;
                }
            }
        });

        const lastDraw = totalDraws ? (data[totalDraws - 1].numbers || []).map(Number) : [];
        return { totalDraws, lookbackWindow, freq, recentFreq, lastSeen, pairCounts, endDigitRecent, zoneRecent, lastDraw };
    }
};
