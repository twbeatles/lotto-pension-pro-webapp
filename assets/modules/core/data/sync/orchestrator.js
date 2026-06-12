import { $, estimateLatestDrawKST } from '../../../utils/utils.js';
import { UIManager } from '../../UIManager.js';
import { UI_STRINGS } from '../../../utils/strings.js';
import { CONFIG } from '../../../utils/config.js';

export const dataSyncOrchestratorMethods = {
    async fetchWinningStats(options = {}) {
        const statusEl = $('#syncStatus');
        const notifyTicketSettle = options.notifyTicketSettle !== false;
        const preserveExistingOnFailure = options.preserveExistingOnFailure !== false;
        const previousWinningStats = Array.isArray(this.state.winningStats)
            ? this.state.winningStats.map((row) => ({ ...row }))
            : [];
        const previousDataHealth = this.mergeDataHealth?.(this.dataHealth || this.getDefaultDataHealth()) || null;
        const previousStaticLatestDrawNo = Math.max(0, Number(this.state.staticLatestDrawNo || 0));
        const updateStatus = (text, color) => {
            if (statusEl) {
                statusEl.querySelector('.text') && (statusEl.querySelector('.text').textContent = text);
                statusEl.querySelector('.dot') && (statusEl.querySelector('.dot').style.background = color);
            }
        };
        const mergeWinningStatRows = (...groups) => {
            const mergedMap = new Map();
            groups.forEach((group) => {
                (Array.isArray(group) ? group : [])
                    .map((row) => this.normalizeDrawItem(row))
                    .filter(Boolean)
                    .forEach((row) => mergedMap.set(Number(row.draw_no), row));
            });
            return Array.from(mergedMap.values()).sort((a, b) => b.draw_no - a.draw_no);
        };
        const preserveExistingWinningStats = async (staticError, localUpdates = []) => {
            const preservedItems = mergeWinningStatRows(previousWinningStats, localUpdates);
            if (!preservedItems.length) return false;

            this.state.winningStats = preservedItems;
            this.state.staticLatestDrawNo = previousStaticLatestDrawNo || preservedItems[0]?.draw_no || 0;
            this.buildAnalyticsCache();

            const preservedBaseHealth = this.getWinningStatsDataHealth({
                staticItems: previousWinningStats,
                localUpdates,
                mergedItems: preservedItems,
                staticError
            });
            const previousAvailability =
                previousDataHealth?.availability && previousDataHealth.availability !== 'none'
                    ? previousDataHealth.availability
                    : '';
            const previousSource =
                previousDataHealth?.source && previousDataHealth.source !== 'none' ? previousDataHealth.source : '';
            const preservedAvailability =
                previousAvailability === 'full'
                    ? 'full'
                    : preservedBaseHealth.availability !== 'none'
                      ? preservedBaseHealth.availability
                      : previousAvailability || 'partial';
            const preservedSource =
                localUpdates.length && previousSource === 'static'
                    ? 'static_local'
                    : preservedBaseHealth.source !== 'none'
                      ? preservedBaseHealth.source
                      : previousSource || (localUpdates.length ? 'static_local' : 'static');
            const preservedHealth = this.mergeDataHealth({
                ...preservedBaseHealth,
                availability: preservedAvailability,
                source: preservedSource,
                latestDrawNo: preservedItems[0]?.draw_no || 0,
                message: localUpdates.length
                    ? '당첨 데이터 새로고침에 실패해 이전에 로드된 데이터와 로컬 보정 데이터를 유지합니다.'
                    : '당첨 데이터 새로고침에 실패해 이전에 로드된 데이터를 유지합니다.'
            });
            this.setDataHealth(preservedHealth);
            this.setSyncMeta({
                mode: this.getSyncMode(),
                currentSource: this.getDataHealthSourceLabel(preservedHealth.source)
            });
            this.lastWinningStatsLoad = {
                ok: true,
                offline: false,
                error: String(staticError?.message || ''),
                updatedAt: new Date().toISOString()
            };
            this.clampSyncMetaToWinningStats({ immediate: false });
            await this.reconcileTicketChecks({ silent: !notifyTicketSettle });
            updateStatus('이전 데이터 유지', 'var(--warning)');
            return true;
        };

        try {
            updateStatus('로또 확인 중', 'var(--warning)');

            const localUpdates = this.getLocalUpdates();
            let normalizedStatic = [];
            let staticError = null;

            try {
                const res = await this.fetchWithTimeout('data/winning_stats.json', { cache: 'default' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                const staticData = json.data || json || [];
                normalizedStatic = (Array.isArray(staticData) ? staticData : [])
                    .map((row) => this.normalizeDrawItem(row))
                    .filter(Boolean)
                    .sort((a, b) => b.draw_no - a.draw_no);
            } catch (error) {
                staticError = error;
                console.warn('정적 당첨 데이터 조회 실패', error);
            }
            this.state.staticLatestDrawNo = normalizedStatic[0]?.draw_no || 0;

            const mergedItems = mergeWinningStatRows(normalizedStatic, localUpdates);
            this.state.winningStats = mergedItems;
            this.buildAnalyticsCache();

            const dataHealth = this.getWinningStatsDataHealth({
                staticItems: normalizedStatic,
                localUpdates,
                mergedItems,
                staticError
            });

            if (staticError && preserveExistingOnFailure && previousWinningStats.length) {
                const previousStructure = this.assessWinningStatsStructure(previousWinningStats);
                const mergedStructure = this.assessWinningStatsStructure(mergedItems);
                const localOnlyDowngrade =
                    dataHealth.source === 'local_only' &&
                    (previousStructure.totalDraws > mergedStructure.totalDraws ||
                        (previousStructure.isStructurallyComplete && !mergedStructure.isStructurallyComplete));
                if (dataHealth.availability === 'none' || localOnlyDowngrade) {
                    if (await preserveExistingWinningStats(staticError, localUpdates)) return true;
                }
            }

            this.setDataHealth(dataHealth);

            this.setSyncMeta({
                mode: this.getSyncMode(),
                currentSource:
                    dataHealth.availability === 'full'
                        ? localUpdates.length
                            ? '정적 JSON + 로컬 업데이트'
                            : '정적 JSON'
                        : this.getDataHealthSourceLabel(dataHealth.source)
            });
            this.lastWinningStatsLoad = {
                ok: dataHealth.availability !== 'none',
                offline: false,
                error: String(staticError?.message || ''),
                updatedAt: new Date().toISOString()
            };

            if (dataHealth.availability === 'none') {
                updateStatus('데이터 없음', 'var(--danger)');
                return false;
            }

            this.clampSyncMetaToWinningStats({ immediate: false });
            await this.reconcileTicketChecks({ silent: !notifyTicketSettle });

            const freshness = this.getDataFreshness();
            if (freshness.isPartial) {
                updateStatus('부분 복구', 'var(--warning)');
            } else if (freshness.latestDrawNo > 0 && freshness.isStale) {
                updateStatus(`${freshness.behindBy}회차 지연`, 'var(--warning)');
            } else {
                updateStatus('최신', 'var(--success)');
            }
            return true;
        } catch (e) {
            console.warn('당첨 데이터 조회 실패', e);
            const offline =
                typeof this.app?.isProbablyOffline === 'function'
                    ? await this.app.isProbablyOffline({ forceProbe: true })
                    : typeof navigator !== 'undefined' && navigator.onLine === false;
            this.setDataHealth({
                availability: 'none',
                source: 'none',
                latestDrawNo: 0,
                message: '당첨 데이터를 구성하지 못했습니다.'
            });
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

    async fetchLatestFromAPI(options = {}) {
        if (typeof options === 'boolean') options = { silent: options };
        const profile = this.createSyncProfile(options);

        const currentProxyFingerprint = this.resolveProxyConfig()?.url || '';
        if (this.syncInFlightPromise) {
            if (currentProxyFingerprint === (this._syncInFlightProxyFingerprint || '')) {
                if (profile.toast) UIManager.toast(UI_STRINGS.sync.alreadyRunning, 'info');
                return this.syncInFlightPromise;
            }
            this.abortSyncInFlight?.({ force: true });
        }

        const cancelable = profile.trigger === 'manual';
        const runId = ++this._syncRunId;
        const controller = new AbortController();
        this.syncAbortController = controller;
        this.syncCancelable = cancelable;
        this._syncInFlightProxyFingerprint = currentProxyFingerprint;
        this._activeSyncRunId = runId;
        this.setSyncControlsState({ running: true, cancelable });

        const task = this._fetchLatestFromAPIInternal(options, controller.signal, runId)
            .catch((e) => {
                if (this.isAbortError(e)) {
                    if (profile.toast) UIManager.toast(UI_STRINGS.sync.cancelled, 'info');
                    return false;
                }
                throw e;
            })
            .finally(() => {
                if (!this.isActiveSyncRun(runId)) return;
                if (this.syncAbortController === controller) {
                    this.syncAbortController = null;
                }
                this.syncCancelable = false;
                this._syncInFlightProxyFingerprint = null;
                this.setSyncControlsState({ running: false, cancelable: false });
                this.syncInFlightPromise = null;
            });

        this.syncInFlightPromise = task;
        return task;
    },

    async _fetchLatestFromAPIInternal(options = {}, abortSignal = null, runId = 0) {
        const profile = this.createSyncProfile(options);
        const silent = profile.silent;
        const logEl = $('#syncLog');
        if (logEl && !silent) {
            logEl.style.display = 'block';
            logEl.innerHTML = '';
            logEl.setAttribute('aria-busy', 'true');
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
            this.ensureActiveSyncRun(runId);
            const proxyConfig = this.resolveProxyConfig();
            const syncMode = this.getSyncMode(proxyConfig);
            const syncSource = this.getSyncSourceLabel(proxyConfig);
            this.setSyncMeta({
                mode: syncMode,
                currentSource: syncSource
            });

            const latestKnown = Math.max(0, Number(this.state.winningStats[0]?.draw_no || 0));
            const estNo = estimateLatestDrawKST();
            const hasExistingData = latestKnown > 0;
            const rangeFrom = hasExistingData ? latestKnown + 1 : Math.max(1, estNo - this.PARTIAL_RECOVERY_WINDOW + 1);

            if (hasExistingData && latestKnown >= estNo) {
                log(UI_STRINGS.sync.logUpToDate, 'SYNC_UP_TO_DATE');
                if (profile.trigger !== 'idle') {
                    this.markSyncSuccess({
                        drawNo: latestKnown,
                        source: syncSource,
                        mode: syncMode
                    });
                }
                if (profile.toast) UIManager.toast(UI_STRINGS.sync.upToDate, 'info');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                clearWarningOnSuccess = true;
                return true;
            }

            if (hasExistingData) {
                log(UI_STRINGS.sync.logRange(rangeFrom, estNo), 'SYNC_RANGE_START');
            } else {
                log(
                    `정적 JSON이 없어 최근 ${this.PARTIAL_RECOVERY_WINDOW}회차(${rangeFrom}~${estNo}) 부분 복구를 시도합니다.`,
                    'SYNC_PARTIAL_RECOVERY_START'
                );
            }
            log(UI_STRINGS.sync.logSource(syncSource), 'SYNC_PROXY_SOURCE');

            if (proxyConfig?.invalid) {
                log(
                    `지원되지 않는 데이터 연결 형식(${proxyConfig.source})은 무시하고 기본 자동 동기화를 사용합니다.`,
                    'SYNC_PROXY_UNSUPPORTED'
                );
            } else if (!proxyConfig?.url) {
                log('고급 데이터 연결 주소 없이 기본 자동 동기화 소스를 사용합니다.', 'SYNC_FALLBACK_SOURCE');
            }

            const newItems = [];
            const fetched = new Set();

            const chunkResult = await this.fetchRangeChunkedFromProxy(rangeFrom, estNo, proxyConfig, log, abortSignal);
            this.ensureActiveSyncRun(runId);
            (chunkResult.items || []).forEach((item) => {
                if (!item || fetched.has(item.draw_no)) return;
                fetched.add(item.draw_no);
                newItems.push(item);
            });

            const fallbackTargets = new Set([...(chunkResult.missing || []), ...(chunkResult.failedDraws || [])]);
            for (let drawNo = rangeFrom; drawNo <= estNo; drawNo++) {
                if (!fetched.has(drawNo)) fallbackTargets.add(drawNo);
            }

            let fallbackTargetList = [...fallbackTargets]
                .map(Number)
                .filter(Number.isFinite)
                .sort((a, b) => b - a);
            if (fallbackTargetList.length > CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS) {
                log(
                    UI_STRINGS.sync.logFallbackLimit(fallbackTargetList.length, CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS),
                    'SYNC_FALLBACK_LIMIT'
                );
                fallbackTargetList = fallbackTargetList.slice(0, CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS);
            }

            const fallbackItems = await this.fetchMissingDraws(fallbackTargetList, proxyConfig, log, abortSignal);
            this.ensureActiveSyncRun(runId);
            fallbackItems.forEach((item) => {
                if (!item || fetched.has(item.draw_no)) return;
                fetched.add(item.draw_no);
                newItems.push(item);
            });

            const updatedCount = newItems.length;

            if (updatedCount > 0) {
                const currentUpdates = this.getLocalUpdates({ warningMode: profile.toast ? 'manual' : 'auto' });
                const merged = [...currentUpdates, ...newItems];
                const unique = Array.from(new Map(merged.map((item) => [item.draw_no, item])).values());
                const localUpdateResult = this.setLocalUpdates(unique, {
                    warningMode: profile.toast ? 'manual' : 'auto'
                });

                log(UI_STRINGS.sync.logApplied(updatedCount), 'SYNC_APPLIED', { updatedCount });
                await this.fetchWinningStats({ notifyTicketSettle: false });
                this.ensureActiveSyncRun(runId);
                this.markSyncSuccess({
                    drawNo: this.state.winningStats[0]?.draw_no || latestKnown,
                    source: syncSource,
                    mode: syncMode
                });
                this.app?.updateLatestWin?.();
                await this.app?.refreshCurrentRoute();
                if (profile.toast) {
                    UIManager.toast(
                        UI_STRINGS.sync.updatedCount(updatedCount, localUpdateResult.droppedFuture),
                        'success'
                    );
                }
                clearWarningOnSuccess = true;
            } else {
                if (!hasExistingData || latestKnown < estNo) {
                    const failureMessage = '예상 최신 회차 응답을 확인하지 못했습니다.';
                    log(failureMessage, 'SYNC_NO_UPDATE_STALE');
                    await this.settlePendingTickets({
                        silent: profile.settleSilent,
                        requestSystemNotification: profile.requestSystemNotification
                    });
                    this.ensureActiveSyncRun(runId);
                    this.markSyncFailure(failureMessage, {
                        source: syncSource,
                        mode: syncMode
                    });
                    if (profile.toast) UIManager.toast(UI_STRINGS.sync.latestUnavailable, 'warning');
                    return false;
                }
                log(UI_STRINGS.sync.logNoNew, 'SYNC_NO_UPDATE');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                this.ensureActiveSyncRun(runId);
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
                log(UI_STRINGS.sync.logCancelled, 'SYNC_ABORT');
                throw e;
            }
            log(UI_STRINGS.sync.logError(e.message), 'SYNC_ERROR', { message: e.message });
            this.markSyncFailure(e.message, {
                source: this.getSyncSourceLabel(),
                mode: this.getSyncMode()
            });
            if (profile.toast) UIManager.toast(UI_STRINGS.sync.genericError, 'error');
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
            if (logEl && !silent) logEl.setAttribute('aria-busy', 'false');
        }
    }
};
