import { CONFIG } from '../../utils/config.js';
import { $, estimateLatestDrawKST } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
import { measureAsync } from '../../utils/perf.js';

const OFFICIAL_DRAW_API_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=';
const BUILTIN_SYNC_SINGLE_PROVIDERS = [
    {
        label: 'CodeTabs',
        buildUrl(targetUrl) {
            return `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
        }
    },
    {
        label: 'corsproxy.io',
        buildUrl(targetUrl) {
            return `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        }
    }
];

export const dataSyncMethods = {
    async fetchWithTimeout(url, options = {}, timeoutMs = this.SYNC_FETCH_TIMEOUT_MS, externalSignal = null) {
        return measureAsync('sync.fetch', async () => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller
                ? setTimeout(() => controller.abort(), timeoutMs)
                : null;
            let onExternalAbort = null;

            try {
                if (controller && externalSignal) {
                    if (externalSignal.aborted) throw this.createAbortError('Sync aborted');
                    onExternalAbort = () => controller.abort();
                    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
                }
                const nextOptions = controller ? { ...options, signal: controller.signal } : options;
                return await fetch(url, nextOptions);
            } finally {
                if (timer) clearTimeout(timer);
                if (externalSignal && onExternalAbort) {
                    externalSignal.removeEventListener('abort', onExternalAbort);
                }
            }
        }, {
            timeoutMs,
            url: String(url).slice(0, 120)
        });
    },

    createSyncProfile(options = {}) {
        const trigger = String(options?.trigger || '');
        if (['idle', 'auto', 'online', 'resume', 'proxy-change'].includes(trigger)) {
            return {
                trigger,
                silent: true,
                settleSilent: true,
                toast: false,
                requestSystemNotification: false
            };
        }
        return {
            trigger: trigger === 'refresh' ? 'refresh' : 'manual',
            silent: false,
            settleSilent: false,
            toast: true,
            requestSystemNotification: true
        };
    },

    logSync(code, message, meta = null) {
        if (meta && typeof meta === 'object') {
            console.log(`[${code}] ${message}`, meta);
            return;
        }
        console.log(`[${code}] ${message}`);
    },

    async fetchWinningStats(options = {}) {
        const statusEl = $('#syncStatus');
        const notifyTicketSettle = options.notifyTicketSettle !== false;
        const updateStatus = (text, color) => {
            if (statusEl) {
                statusEl.querySelector('.text') && (statusEl.querySelector('.text').textContent = text);
                statusEl.querySelector('.dot') && (statusEl.querySelector('.dot').style.background = color);
            }
        };

        try {
            updateStatus('로또 확인 중', 'var(--warning)');

            const res = await this.fetchWithTimeout('data/winning_stats.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const staticData = json.data || json || [];
            const normalizedStatic = (Array.isArray(staticData) ? staticData : [])
                .map((row) => this.normalizeDrawItem(row))
                .filter(Boolean)
                .sort((a, b) => b.draw_no - a.draw_no);
            this.state.staticLatestDrawNo = normalizedStatic[0]?.draw_no || 0;

            const localUpdates = this.getLocalUpdates();

            const mergedMap = new Map();
            normalizedStatic.forEach((d) => mergedMap.set(Number(d.draw_no), d));
            localUpdates.forEach(d => mergedMap.set(Number(d.draw_no), d));

            this.state.winningStats = Array.from(mergedMap.values())
                .map((row) => this.normalizeDrawItem(row))
                .filter(Boolean)
                .sort((a, b) => b.draw_no - a.draw_no);
            this.buildAnalyticsCache();

            this.setSyncMeta({
                mode: this.getSyncMode(),
                currentSource: localUpdates.length ? '정적 JSON + 로컬 업데이트' : '정적 JSON'
            });
            this.lastWinningStatsLoad = {
                ok: true,
                offline: false,
                error: '',
                updatedAt: new Date().toISOString()
            };

            await this.settlePendingTickets({ silent: !notifyTicketSettle });

            const freshness = this.getDataFreshness();
            if (freshness.latestDrawNo > 0 && freshness.isStale) {
                updateStatus(`${freshness.behindBy}회차 지연`, 'var(--warning)');
            } else {
                updateStatus('최신', 'var(--success)');
            }
            return true;
        } catch (e) {
            console.warn('당첨 데이터 조회 실패', e);
            const offline = typeof this.app?.isProbablyOffline === 'function'
                ? await this.app.isProbablyOffline({ forceProbe: true })
                : (typeof navigator !== 'undefined' && navigator.onLine === false);
            this.lastWinningStatsLoad = {
                ok: false,
                offline,
                error: String(e?.message || ''),
                updatedAt: new Date().toISOString()
            };
            updateStatus(offline ? '오프라인' : '데이터 확인 실패', offline ? 'var(--danger)' : 'var(--warning)');
            return false;
        }
    },

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

            // Content-Type 검증: JSON이 아닌 응답(HTML 에러 페이지 등)을 조기 차단
            const ct = res.headers.get('Content-Type') || '';
            if (!ct.includes('application/json') && !ct.includes('text/plain') && !ct.includes('text/json')) {
                throw new Error(`예상치 못한 응답 형식 (Content-Type: ${ct || '없음'})`);
            }

            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : [];
            const normalized = list.map(item => this.normalizeDrawItem(item)).filter(Boolean);
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

    normalizeDrawItem(raw) {
        if (!raw) return null;
        const drawNo = Number(raw.draw_no ?? raw.ltEpsd);
        if (!drawNo || !Number.isFinite(drawNo)) return null;

        const numbers = Array.isArray(raw.numbers)
            ? raw.numbers
            : [raw.tm1WnNo, raw.tm2WnNo, raw.tm3WnNo, raw.tm4WnNo, raw.tm5WnNo, raw.tm6WnNo];

        const dateRaw = String(raw.date ?? raw.ltRflYmd ?? '');
        const date = dateRaw.length === 8
            ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
            : dateRaw;

        const normalizedNumbers = (numbers || [])
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
            .sort((a, b) => a - b);
        const bonus = Number(raw.bonus ?? raw.bnsWnNo ?? 0);

        const normalized = {
            draw_no: drawNo,
            date,
            numbers: normalizedNumbers,
            bonus,
            prize_amount: Number(raw.prize_amount ?? raw.rnk1WnAmt ?? 0),
            winners_count: Number(raw.winners_count ?? raw.rnk1WnNope ?? 0),
            total_sales: Number(raw.total_sales ?? raw.rlvtEpsdSumNtslAmt ?? 0)
        };
        if (normalized.numbers.length !== 6) return null;
        if (new Set(normalized.numbers).size !== 6) return null;
        if (!Number.isInteger(normalized.bonus) || normalized.bonus < 1 || normalized.bonus > 45) return null;
        if (normalized.numbers.includes(normalized.bonus)) return null;
        return normalized;
    },

    buildCustomSingleFetchUrls(drawNo, proxyConfig = this.resolveProxyConfig()) {
        const targetUrl = `${OFFICIAL_DRAW_API_URL}${drawNo}`;
        const customProxy = proxyConfig?.url || '';
        if (!customProxy) return [];

        const urls = [];
        const label = proxyConfig?.source || '사용자 프록시';

        if (customProxy.includes('{draw_no}')) {
            urls.push({ label, url: customProxy.replace('{draw_no}', String(drawNo)) });
        } else if (customProxy.includes('/proxy/latest')) {
            if (customProxy.includes('draw_no=')) {
                urls.push({ label, url: customProxy.replace(/draw_no=\d*/i, `draw_no=${drawNo}`) });
            } else {
                const delim = customProxy.includes('?') ? '&' : '?';
                urls.push({ label, url: `${customProxy}${delim}draw_no=${drawNo}` });
            }
        } else if (customProxy.includes('{url}')) {
            urls.push({ label, url: customProxy.replace('{url}', encodeURIComponent(targetUrl)) });
        } else {
            urls.push({ label, url: `${customProxy}${encodeURIComponent(targetUrl)}` });
        }

        return urls;
    },

    buildBuiltInSingleFetchUrls(drawNo) {
        const targetUrl = `${OFFICIAL_DRAW_API_URL}${drawNo}`;
        return BUILTIN_SYNC_SINGLE_PROVIDERS.map((provider) => ({
            label: provider.label,
            url: provider.buildUrl(targetUrl)
        }));
    },

    parseSyncPayload(rawText = '') {
        let text = String(rawText || '').trim();
        if (!text) return null;

        if (text.startsWith('Title:') && text.includes('Markdown Content:')) {
            text = text.split('Markdown Content:').slice(1).join('Markdown Content:').trim();
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            return null;
        }

        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
            } catch (e) {
                return null;
            }
        }

        if (parsed?.contents && typeof parsed.contents === 'string') {
            try {
                parsed = JSON.parse(parsed.contents);
            } catch (e) {
                return null;
            }
        } else if (parsed?.contents) {
            parsed = parsed.contents;
        }

        return parsed && typeof parsed === 'object' ? parsed : null;
    },

    describePayloadShape(payload) {
        if (!payload || typeof payload !== 'object') {
            return {
                payloadType: typeof payload,
                keys: []
            };
        }

        const keys = Object.keys(payload).slice(0, 12);
        return {
            payloadType: Array.isArray(payload) ? 'array' : 'object',
            keys,
            hasNormalized: Array.isArray(payload?.normalized),
            normalizedCount: Array.isArray(payload?.normalized) ? payload.normalized.length : 0,
            hasDataList: Array.isArray(payload?.data?.list),
            dataListCount: Array.isArray(payload?.data?.list) ? payload.data.list.length : 0,
            hasDataArray: Array.isArray(payload?.data),
            dataCount: Array.isArray(payload?.data) ? payload.data.length : 0
        };
    },

    extractSingleDrawFromPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (Array.isArray(payload?.normalized) && payload.normalized[0]) {
            return this.normalizeDrawItem(payload.normalized[0]);
        }
        if (Array.isArray(payload?.data?.list) && payload.data.list[0]) {
            return this.normalizeDrawItem(payload.data.list[0]);
        }
        if (Array.isArray(payload?.data) && payload.data[0]) {
            return this.normalizeDrawItem(payload.data[0]);
        }
        return this.normalizeDrawItem(payload);
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
        const chunkResults = await this.runWithConcurrency(chunks, this.RANGE_CHUNK_CONCURRENCY, async ([start, end]) => {
            if (signal?.aborted) throw this.createAbortError('Sync aborted');
            return this.fetchRangeFromProxy(start, end, proxyConfig, log, signal);
        });

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
    },

    async fetchLatestFromAPI(options = {}) {
        if (typeof options === 'boolean') options = { silent: options };
        const profile = this.createSyncProfile(options);

        // 프록시 설정 fingerprint: 설정이 바뀐 경우 기존 in-flight 요청을 재사용하지 않음
        const currentProxyFingerprint = (this.resolveProxyConfig()?.url || '');
        if (this.syncInFlightPromise) {
            if (currentProxyFingerprint === (this._syncInFlightProxyFingerprint || '')) {
                if (profile.toast) UIManager.toast('이미 동기화가 진행 중입니다.', 'info');
                return this.syncInFlightPromise;
            }
            // 설정이 바뀌었으므로 기존 요청을 취소하고 새로 시작
            this.cancelActiveSync?.();
        }

        const cancelable = profile.trigger === 'manual';
        this.syncAbortController = cancelable ? new AbortController() : null;
        this.syncCancelable = cancelable;
        this._syncInFlightProxyFingerprint = currentProxyFingerprint;
        this.setSyncControlsState({ running: true, cancelable });

        const task = this._fetchLatestFromAPIInternal(options, this.syncAbortController?.signal || null)
            .catch((e) => {
                if (this.isAbortError(e)) {
                    if (profile.toast) UIManager.toast('동기화를 취소했습니다.', 'info');
                    return false;
                }
                throw e;
            })
            .finally(() => {
                this.syncAbortController = null;
                this.syncCancelable = false;
                this._syncInFlightProxyFingerprint = null;
                this.setSyncControlsState({ running: false, cancelable: false });
                this.syncInFlightPromise = null;
            });

        this.syncInFlightPromise = task;
        return task;
    },

    async _fetchLatestFromAPIInternal(options = {}, abortSignal = null) {
        const profile = this.createSyncProfile(options);
        const silent = profile.silent;
        const logEl = $('#syncLog');
        if (logEl && !silent) {
            logEl.style.display = 'block';
            logEl.innerHTML = '';
        }

        const logBuffer = [];
        let logFlushTimer = null;
        const syncWarnings = [];
        let clearWarningOnSuccess = false;
        const flushLog = () => {
            if (!logEl || silent || !logBuffer.length) return;
            const fragment = document.createDocumentFragment();
            while (logBuffer.length) {
                const line = document.createElement('div');
                line.textContent = logBuffer.shift();
                fragment.appendChild(line);
            }
            logEl.appendChild(fragment);
            logEl.scrollTop = logEl.scrollHeight;
            logFlushTimer = null;
        };
        const scheduleFlush = () => {
            if (logFlushTimer) return;
            logFlushTimer = setTimeout(flushLog, 120);
        };

        const log = (msg, code = 'SYNC_INFO', meta = null) => {
            if (logEl && !silent) {
                logBuffer.push(msg);
                scheduleFlush();
            }
            if (code === 'SYNC_FETCH_ONE_INVALID_PAYLOAD') {
                syncWarnings.push(String(msg || '').slice(0, 240));
            }
            this.logSync(code, msg, meta);
        };

        try {
            const proxyConfig = this.resolveProxyConfig();
            const syncMode = this.getSyncMode(proxyConfig);
            const syncSource = this.getSyncSourceLabel(proxyConfig);
            this.setSyncMeta({
                mode: syncMode,
                currentSource: syncSource
            });

            const latestKnown = this.state.winningStats[0]?.draw_no || 1000;
            const estNo = estimateLatestDrawKST();

            if (latestKnown >= estNo) {
                log('Already up to date.', 'SYNC_UP_TO_DATE');
                if (profile.trigger !== 'idle') {
                    this.markSyncSuccess({
                        drawNo: latestKnown,
                        source: syncSource,
                        mode: syncMode
                    });
                }
                if (profile.toast) UIManager.toast('이미 최신 데이터입니다.', 'info');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                clearWarningOnSuccess = true;
                return true;
            }

            log(`Sync target range: ${latestKnown + 1} ~ ${estNo}`, 'SYNC_RANGE_START');
            log(`Sync source: ${syncSource}`, 'SYNC_PROXY_SOURCE');

            if (proxyConfig?.invalid) {
                log(
                    `지원되지 않는 프록시 형식(${proxyConfig.source})은 무시하고 기본 자동 동기화를 사용합니다.`,
                    'SYNC_PROXY_UNSUPPORTED'
                );
            } else if (!proxyConfig?.url) {
                log('사용자 프록시 없이 기본 자동 동기화 소스를 사용합니다.', 'SYNC_FALLBACK_SOURCE');
            }

            const newItems = [];
            const fetched = new Set();

            const chunkResult = await this.fetchRangeChunkedFromProxy(
                latestKnown + 1,
                estNo,
                proxyConfig,
                log,
                abortSignal
            );
            (chunkResult.items || []).forEach((item) => {
                if (!item || fetched.has(item.draw_no)) return;
                fetched.add(item.draw_no);
                newItems.push(item);
            });

            const fallbackTargets = new Set([
                ...(chunkResult.missing || []),
                ...(chunkResult.failedDraws || [])
            ]);
            for (let drawNo = latestKnown + 1; drawNo <= estNo; drawNo++) {
                if (!fetched.has(drawNo)) fallbackTargets.add(drawNo);
            }

            let fallbackTargetList = [...fallbackTargets]
                .map(Number)
                .filter(Number.isFinite)
                .sort((a, b) => b - a);
            if (fallbackTargetList.length > CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS) {
                log(
                    `Fallback 대상이 ${fallbackTargetList.length}개라 최근 ${CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS}개만 요청합니다.`,
                    'SYNC_FALLBACK_LIMIT'
                );
                fallbackTargetList = fallbackTargetList.slice(0, CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS);
            }

            const fallbackItems = await this.fetchMissingDraws(fallbackTargetList, proxyConfig, log, abortSignal);
            fallbackItems.forEach((item) => {
                if (!item || fetched.has(item.draw_no)) return;
                fetched.add(item.draw_no);
                newItems.push(item);
            });

            const updatedCount = newItems.length;

            if (updatedCount > 0) {
                const currentUpdates = this.getLocalUpdates();
                const merged = [...currentUpdates, ...newItems];
                const unique = Array.from(new Map(merged.map(item => [item.draw_no, item])).values());
                this.setLocalUpdates(unique);

                log(`Applied ${updatedCount} draw updates.`, 'SYNC_APPLIED', { updatedCount });
                await this.fetchWinningStats({ notifyTicketSettle: false });
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                this.markSyncSuccess({
                    drawNo: this.state.winningStats[0]?.draw_no || latestKnown,
                    source: syncSource,
                    mode: syncMode
                });
                this.app?.updateLatestWin?.();
                await this.app?.refreshCurrentRoute();
                if (profile.toast) UIManager.toast(`${updatedCount}개 회차 업데이트 완료`, 'success');
                clearWarningOnSuccess = true;
            } else {
                if (latestKnown < estNo) {
                    const failureMessage = '예상 최신 회차 응답을 확인하지 못했습니다.';
                    log(failureMessage, 'SYNC_NO_UPDATE_STALE');
                    await this.settlePendingTickets({
                        silent: profile.settleSilent,
                        requestSystemNotification: profile.requestSystemNotification
                    });
                    this.markSyncFailure(failureMessage, {
                        source: syncSource,
                        mode: syncMode
                    });
                    if (profile.toast) UIManager.toast('최신 회차를 확인하지 못했습니다.', 'warning');
                    return false;
                }
                log('No new draw data found.', 'SYNC_NO_UPDATE');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                this.markSyncSuccess({
                    drawNo: latestKnown,
                    source: syncSource,
                    mode: syncMode
                });
                clearWarningOnSuccess = true;
            }
            return true;
        } catch (e) {
            if (this.isAbortError(e)) {
                log('Sync cancelled by user.', 'SYNC_ABORT');
                throw e;
            }
            log(`Sync error: ${e.message}`, 'SYNC_ERROR', { message: e.message });
            this.markSyncFailure(e.message, {
                source: this.getSyncSourceLabel(),
                mode: this.getSyncMode()
            });
            if (profile.toast) UIManager.toast('동기화 중 오류가 발생했습니다.', 'error');
            return false;
        } finally {
            if (syncWarnings.length) {
                this.markSyncWarning(syncWarnings[syncWarnings.length - 1]);
            } else if (clearWarningOnSuccess && this.state.syncMeta?.lastWarningMessage) {
                this.markSyncWarning('');
            }
            if (logFlushTimer) {
                clearTimeout(logFlushTimer);
                logFlushTimer = null;
            }
            flushLog();
        }
    }
};
