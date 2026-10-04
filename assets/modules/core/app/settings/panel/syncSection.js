import { $ } from '../../../../utils/utils.js';

export const appSettingsSyncSectionMethods = {
    renderSettingsSyncSection() {
        if (typeof document === 'undefined') return;
        const freshness = this.data.getDataFreshness();
        const freshnessSummary = this.data.getDataFreshnessSummary?.(freshness) || '';
        const freshnessSummaryEl = $('#syncDataFreshnessSummary');
        if (freshnessSummaryEl) freshnessSummaryEl.textContent = freshnessSummary;

        const queryProxy = this.data.getQueryProxyUrl?.();
        const queryProxyNotice = $('#queryProxyNotice');
        if (queryProxyNotice) {
            const suppressed = this.data._isQueryProxySuppressed?.(queryProxy);
            const showNotice = Boolean(queryProxy?.valid && queryProxy?.url);
            queryProxyNotice.hidden = !showNotice;
            queryProxyNotice.style.display = showNotice ? 'block' : 'none';
            if (showNotice) {
                queryProxyNotice.textContent = suppressed
                    ? `URL 프록시(${queryProxy.input})를 이번 세션에서 무시하고 있습니다.`
                    : `URL 프록시가 활성화되어 있습니다: ${queryProxy.input}`;
            }
        }

        const syncMeta = this.data.state.syncMeta || this.data.getDefaultSyncMeta?.() || {};
        const pensionHealth = this.data.pension720DataHealth || this.data.getDefaultPension720DataHealth?.();
        const pensionSyncMeta = this.data.mergePension720SyncMeta?.(
            syncMeta.pension720 || this.data.getDefaultPension720SyncMeta?.()
        ) || {};
        const pensionSourceEl = $('#pension720SyncMetaSource');
        if (pensionSourceEl) {
            pensionSourceEl.textContent =
                pensionSyncMeta.currentSource ||
                this.data.getPension720DataHealthSourceLabel?.(pensionHealth.source) ||
                '-';
        }
        const pensionDrawEl = $('#pension720SyncMetaDraw');
        if (pensionDrawEl) {
            pensionDrawEl.textContent = pensionHealth.latestDrawNo ? `${pensionHealth.latestDrawNo}회차` : '-';
        }
        const pensionSuccessEl = $('#pension720SyncMetaLastSuccess');
        if (pensionSuccessEl) {
            pensionSuccessEl.textContent = pensionSyncMeta.lastSuccessAt
                ? this.formatDateTime(pensionSyncMeta.lastSuccessAt)
                : '-';
        }
        const pensionLastDrawEl = $('#pension720SyncMetaLastDraw');
        if (pensionLastDrawEl) {
            pensionLastDrawEl.textContent = pensionSyncMeta.lastSuccessDrawNo
                ? `${pensionSyncMeta.lastSuccessDrawNo}회차`
                : '-';
        }
        const pensionFailureEl = $('#pension720SyncMetaLastFailure');
        if (pensionFailureEl) {
            pensionFailureEl.textContent = pensionSyncMeta.lastFailureMessage
                ? `${this.formatDateTime(pensionSyncMeta.lastFailureAt)} · ${pensionSyncMeta.lastFailureMessage}`
                : '-';
        }
        const pensionMessageEl = $('#pension720SyncMetaMessage');
        if (pensionMessageEl) {
            pensionMessageEl.textContent = pensionHealth.message || '연금복권 데이터 상태를 확인하는 중입니다.';
        }
        const activeProxyConfig = this.data.resolveProxyConfig();
        const syncModeEl = $('#syncMetaMode');
        if (syncModeEl) syncModeEl.textContent = this.data.getSyncModeLabel(syncMeta.mode);
        const syncSourceEl = $('#syncMetaSource');
        if (syncSourceEl)
            syncSourceEl.textContent =
                syncMeta.currentSource || this.data.getDataHealthSourceLabel(freshness.source) || '-';
        const syncSuccessEl = $('#syncMetaLastSuccess');
        if (syncSuccessEl)
            syncSuccessEl.textContent = syncMeta.lastSuccessAt ? this.formatDateTime(syncMeta.lastSuccessAt) : '-';
        const syncDrawEl = $('#syncMetaLastDraw');
        if (syncDrawEl) syncDrawEl.textContent = syncMeta.lastSuccessDrawNo ? `${syncMeta.lastSuccessDrawNo}회차` : '-';
        const syncFailureEl = $('#syncMetaLastFailure');
        if (syncFailureEl) {
            syncFailureEl.textContent = syncMeta.lastFailureMessage
                ? `${this.formatDateTime(syncMeta.lastFailureAt)} · ${syncMeta.lastFailureMessage}`
                : '-';
        }
        const syncWarningMetaEl = $('#syncMetaLastWarning');
        if (syncWarningMetaEl) {
            syncWarningMetaEl.textContent = syncMeta.lastWarningMessage
                ? `${this.formatDateTime(syncMeta.lastWarningAt)} · ${syncMeta.lastWarningMessage}`
                : '-';
        }
        const syncWarningEl = $('#syncMetaWarning');
        if (syncWarningEl) {
            if (syncMeta.mode === 'local_restore_failed' && syncMeta.lastFailureMessage) {
                syncWarningEl.textContent = `백업 복원은 완료됐지만 당첨 데이터 재구성에 실패했습니다. ${syncMeta.lastFailureMessage}`;
            } else if (activeProxyConfig?.invalid) {
                syncWarningEl.textContent = `${activeProxyConfig.source} 연결 형식이 지원되지 않아 기본 자동 동기화를 사용 중입니다.`;
            } else if (freshness.isUnavailable) {
                syncWarningEl.textContent =
                    freshness.dataHealthMessage || '당첨 번호 데이터가 없어요. 아래 「최신 회차 확인」을 눌러 주세요.';
            } else if (freshness.isPartial) {
                syncWarningEl.textContent = freshness.dataHealthMessage
                    ? `${freshness.dataHealthMessage} 통계·번호 추천·시뮬레이션은 전체 데이터를 받은 뒤 쓸 수 있어요.`
                    : '최근 일부 회차만 가지고 있어요. 통계를 쓰는 기능은 잠시 제한됩니다.';
            } else if (freshness.isStale) {
                syncWarningEl.textContent = freshness.canAutoSync
                    ? `최신 당첨 결과가 ${freshness.behindBy}회차 빠져 있어요. 「최신 회차 확인」을 누르면 받아옵니다.`
                    : `최신 당첨 결과가 ${freshness.behindBy}회차 빠져 있어요.`;
            } else if (freshness.staticBehindBy > 0) {
                syncWarningEl.textContent = `앱에 포함된 데이터는 ${freshness.staticBehindBy}회차 전 것이지만, 이 기기에서 받은 최신 결과로 채워 두었어요.`;
            } else {
                syncWarningEl.textContent = '최신 당첨 결과까지 모두 받아 두었어요.';
            }
        }

        const syncStateBadge = $('#settingsSyncStateBadge');
        if (syncStateBadge) {
            let syncState = { label: '최신', code: 'success' };
            if (syncMeta.mode === 'local_restore_failed') {
                syncState = { label: '복원 실패', code: 'danger' };
            } else if (freshness.isUnavailable) {
                syncState = { label: '데이터 없음', code: 'danger' };
            } else if (freshness.isPartial) {
                syncState = { label: '일부 데이터', code: 'danger' };
            } else if (freshness.isStale) {
                syncState = freshness.canAutoSync
                    ? { label: `${freshness.behindBy}회차 차이`, code: 'warning' }
                    : { label: '업데이트 필요', code: 'danger' };
            } else if (freshness.staticBehindBy > 0) {
                syncState = { label: '최신 (기기 보완)', code: 'success' };
            }
            syncStateBadge.textContent = syncState.label;
            syncStateBadge.className = `badge ${this.getStatusBadgeClass(syncState.code)}`;
        }
    }
};
