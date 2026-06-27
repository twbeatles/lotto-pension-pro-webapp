export const dataAnalyticsCacheMethods = {
    buildAnalyticsCache() {
        const source = this.state.winningStats || [];
        if (!source.length) {
            this.state.analytics = {
                id: 'empty',
                freq: Array(46).fill(0),
                rangeCounts: [0, 0, 0, 0, 0],
                oddEven: [0, 0],
                topPairs: [],
                hot: [],
                cold: []
            };
            return this.state.analytics;
        }

        const freq = Array(46).fill(0);
        const rangeCounts = [0, 0, 0, 0, 0];
        const oddEven = [0, 0];
        const pairCounts = new Map();

        source.forEach((d) => {
            const nums = d.numbers || [];
            nums.forEach((n) => {
                if (n < 1 || n > 45) return;
                freq[n]++;
                if (n <= 10) rangeCounts[0]++;
                else if (n <= 20) rangeCounts[1]++;
                else if (n <= 30) rangeCounts[2]++;
                else if (n <= 40) rangeCounts[3]++;
                else rangeCounts[4]++;
                if (n % 2 === 0) oddEven[0]++;
                else oddEven[1]++;
            });

            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    const pair = `${nums[i]}-${nums[j]}`;
                    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
                }
            }
        });

        const indexed = freq
            .map((c, i) => ({ n: i, c }))
            .slice(1)
            .sort((a, b) => b.c - a.c);

        const hot = indexed.slice(0, 5);
        const cold = indexed.slice(-5).reverse();

        const topPairs = Array.from(pairCounts.entries())
            .map(([k, count]) => ({ pair: k.split('-').map(Number), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const latestNo = source[0]?.draw_no || 0;
        this.state.analytics = {
            id: `${latestNo}:${source.length}`,
            freq,
            rangeCounts,
            oddEven,
            topPairs,
            hot,
            cold
        };
        return this.state.analytics;
    },

    getAnalytics() {
        return this.state.analytics || this.buildAnalyticsCache();
    }
};