export const dataSyncRangeChunkedMethods = {
    async fetchRangeChunkedFromProxy(fromNo, toNo, proxyConfig, log, signal = null) {
        if (!proxyConfig?.url || fromNo > toNo) {
            return { items: [], missing: new Set(), failedDraws: new Set() };
        }
        const chunks = this.buildRangeChunks(fromNo, toNo, this.RANGE_CHUNK_SIZE);
        const chunkResults = await this.runWithConcurrency(
            chunks,
            this.RANGE_CHUNK_CONCURRENCY,
            async ([start, end]) => {
                if (signal?.aborted) throw this.createAbortError('Sync aborted');
                return this.fetchRangeFromProxy(start, end, proxyConfig, log, signal);
            }
        );

        const items = [];
        const missing = new Set();
        const failedDraws = new Set();

        chunkResults.forEach((result, idx) => {
            const [start, end] = chunks[idx];
            if (!result || result.failed) {
                for (let no = start; no <= end; no++) failedDraws.add(no);
                return;
            }
            (result.items || []).forEach((item) => items.push(item));
            (result.missing || []).forEach((drawNo) => missing.add(Number(drawNo)));
        });

        return { items, missing, failedDraws };
    },

    async fetchMissingDraws(drawNos, proxyConfig, log, signal = null) {
        const sorted = [...new Set((drawNos || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
        if (!sorted.length) return [];

        const results = await this.runWithConcurrency(sorted, this.FALLBACK_FETCH_CONCURRENCY, async (drawNo) => {
            if (signal?.aborted) throw this.createAbortError('Sync aborted');
            log(`- ${drawNo}회차 데이터 요청 중... (fallback)`);
            let item = await this.fetchOneDraw(drawNo, proxyConfig, log, signal);
            if (!item) {
                if (signal?.aborted) throw this.createAbortError('Sync aborted');
                await new Promise((resolve) => setTimeout(resolve, 180));
                item = await this.fetchOneDraw(drawNo, proxyConfig, log, signal);
            }
            if (item) {
                log(`완료: ${drawNo}회차 (${item.date})`);
                return item;
            }
            log(`실패: ${drawNo}회차 데이터 확인 실패 (응답 없음 또는 아직 추첨 전)`);
            return null;
        });

        return results.filter(Boolean);
    }
};