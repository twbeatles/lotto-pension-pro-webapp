import { $ } from '../../../../utils/utils.js';

export const dataSyncOrchestratorFetchWinningStatsMethods = {
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
    }
};