export const dataSyncRangeMethods = {
    async fetchRangeFromProxy(fromNo, toNo, proxyConfig, log, signal = null) {
        if (!proxyConfig?.url || fromNo > toNo) {
            return { items: [], missing: [], failed: true };
        }

        try {
            let baseUrl = '';
            const customProxy = proxyConfig.url;
            const proxyIndex = customProxy.indexOf('/proxy/');
            if (proxyIndex >= 0) {
                baseUrl = customProxy.slice(0, proxyIndex);
            } else {
                const u = new URL(customProxy);
                baseUrl = `${u.origin}`;
            }
            if (!baseUrl) return { items: [], missing: [], failed: true };

            const url = `${baseUrl}/proxy/range?from=${fromNo}&to=${toNo}`;
            const res = await this.fetchWithTimeout(url, {}, this.SYNC_FETCH_TIMEOUT_MS, signal);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const ct = res.headers.get('Content-Type') || '';
            if (!ct.includes('application/json') && !ct.includes('text/plain') && !ct.includes('text/json')) {
                throw new Error(`예상치 못한 응답 형식 (Content-Type: ${ct || '없음'})`);
            }

            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : [];
            const normalized = list.map((item) => this.normalizeDrawItem(item)).filter(Boolean);
            const missing = Array.isArray(payload?.missing)
                ? payload.missing.map((x) => Number(x)).filter(Number.isFinite)
                : [];
            if (normalized.length) {
                log(`[range] 수집 성공: ${fromNo}~${toNo} (${normalized.length}개)`);
            }
            return { items: normalized, missing, failed: false };
        } catch (e) {
            if (this.isAbortError(e)) throw e;
            this.logSync('SYNC_RANGE_FAIL', `Range fetch failed ${fromNo}-${toNo}`, { message: e.message });
            log(`[range] 수집 실패 (${fromNo}~${toNo}): ${e.message}`);
            return { items: [], missing: [], failed: true };
        }
    },

    async fetchOneDraw(drawNo, proxyConfig, log = () => {}, signal = null) {
        const candidates = [
            ...this.buildCustomSingleFetchUrls(drawNo, proxyConfig),
            ...this.buildBuiltInSingleFetchUrls(drawNo)
        ].filter((candidate, index, list) => {
            return candidate?.url && list.findIndex((item) => item.url === candidate.url) === index;
        });

        for (const candidate of candidates) {
            if (signal?.aborted) throw this.createAbortError('Sync aborted');
            try {
                const res = await this.fetchWithTimeout(candidate.url, {}, this.SYNC_FETCH_TIMEOUT_MS, signal);
                if (!res.ok) continue;
                const payload = this.parseSyncPayload(await res.text());
                const item = this.extractSingleDrawFromPayload(payload);
                if (item) return item;
                if (payload) {
                    const shape = this.describePayloadShape(payload);
                    const warningMessage = `${drawNo}회차 응답 구조가 예상 형식과 다릅니다. (${candidate.label})`;
                    this.logSync('SYNC_FETCH_ONE_INVALID_PAYLOAD', `Invalid single draw payload ${drawNo}`, {
                        fetchUrl: candidate.url,
                        source: candidate.label,
                        ...shape
                    });
                    log(warningMessage, 'SYNC_FETCH_ONE_INVALID_PAYLOAD', {
                        source: candidate.label,
                        ...shape
                    });
                }
            } catch (e) {
                if (this.isAbortError(e)) throw e;
                this.logSync('SYNC_FETCH_ONE_FAIL', `Failed single draw fetch ${drawNo}`, {
                    fetchUrl: candidate.url,
                    source: candidate.label,
                    message: e.message
                });
            }
        }
        return null;
    },

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
    },

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
