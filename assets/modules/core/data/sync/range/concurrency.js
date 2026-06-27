export const dataSyncRangeConcurrencyMethods = {
    buildRangeChunks(fromNo, toNo, chunkSize = this.RANGE_CHUNK_SIZE) {
        const chunks = [];
        for (let start = fromNo; start <= toNo; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, toNo);
            chunks.push([start, end]);
        }
        return chunks;
    },

    async runWithConcurrency(items, concurrency, handler) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return [];
        const out = new Array(list.length);
        let cursor = 0;

        const worker = async () => {
            while (true) {
                const index = cursor++;
                if (index >= list.length) return;
                out[index] = await handler(list[index], index);
            }
        };

        const workers = Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, () => worker());
        await Promise.all(workers);
        return out;
    }
};