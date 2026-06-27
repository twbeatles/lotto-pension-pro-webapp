import { estimateLatestDrawKST } from '../../../utils/utils.js';
import { UIManager } from '../../UIManager.js';

export const dataAnalyticsFreshnessMethods = {
    getDataFreshness() {
        const dataHealth = this.mergeDataHealth(this.dataHealth || this.getDefaultDataHealth());
        const latestDrawNo = Math.max(
            0,
            Math.floor(Number(dataHealth.latestDrawNo || this.state.winningStats?.[0]?.draw_no || 0))
        );
        const staticLatestDrawNo = Math.max(0, Math.floor(Number(this.state.staticLatestDrawNo || 0)));
        const estimatedLatestDrawNo = Math.max(0, Math.floor(Number(estimateLatestDrawKST() || 0)));
        const behindBy =
            latestDrawNo > 0 && estimatedLatestDrawNo > 0 ? Math.max(0, estimatedLatestDrawNo - latestDrawNo) : 0;
        const staticBehindBy =
            staticLatestDrawNo > 0 && estimatedLatestDrawNo > 0
                ? Math.max(0, estimatedLatestDrawNo - staticLatestDrawNo)
                : 0;
        const proxyConfig = this.resolveProxyConfig();
        const hasCustomProxy = Boolean(proxyConfig?.url);
        const syncMeta = this.mergeSyncMeta?.(this.state.syncMeta || this.getDefaultSyncMeta?.()) || {};
        const lastFailureMs = Date.parse(syncMeta.lastFailureAt || '');
        const lastSuccessMs = Date.parse(syncMeta.lastSuccessAt || '');
        const failureAfterSuccess =
            Number.isFinite(lastFailureMs) && (!Number.isFinite(lastSuccessMs) || lastFailureMs > lastSuccessMs);
        const recentFailure =
            failureAfterSuccess && Date.now() - lastFailureMs < 10 * 60 * 1000 && Boolean(syncMeta.lastFailureMessage);
        const canAutoSync = !recentFailure || hasCustomProxy;
        return {
            availability: dataHealth.availability,
            source: dataHealth.source,
            dataHealthMessage: dataHealth.message,
            latestDrawNo,
            staticLatestDrawNo,
            estimatedLatestDrawNo,
            behindBy,
            staticBehindBy,
            hasProxy: hasCustomProxy,
            hasCustomProxy,
            canAutoSync,
            autoSyncBlockedReason: canAutoSync ? '' : syncMeta.lastFailureMessage || 'recent sync failure',
            isPartial: dataHealth.availability === 'partial',
            isUnavailable: dataHealth.availability === 'none' || latestDrawNo <= 0,
            isStale: dataHealth.availability === 'full' && behindBy > 0
        };
    },

    getDataFreshnessSummary(freshness = this.getDataFreshness()) {
        const latest = Math.max(0, Math.floor(Number(freshness.latestDrawNo || 0)));
        const estimated = Math.max(0, Math.floor(Number(freshness.estimatedLatestDrawNo || 0)));
        const behindBy =
            latest > 0 && estimated > 0 ? Math.max(0, Math.floor(Number(freshness.behindBy ?? estimated - latest))) : 0;
        const latestLabel = latest > 0 ? `${latest}회` : '없음';
        const estimatedLabel = estimated > 0 ? `${estimated}회` : '계산 중';
        const gapLabel = latest > 0 && estimated > 0 ? `${behindBy}회` : '-';
        return `내 데이터: ${latestLabel} / 예상 최신: ${estimatedLabel} / 차이 ${gapLabel}`;
    },

    getStaleDataMessage(featureLabel = '기능') {
        const freshness = this.getDataFreshness();
        if (freshness.isPartial) {
            return `${featureLabel}은 사용할 수 있지만 현재 데이터는 일부만 사용 중입니다. 최신 회차 일부만 반영되어 결과가 제한될 수 있습니다.`;
        }
        if (freshness.isUnavailable) {
            return `${featureLabel}에 필요한 당첨 데이터가 없습니다. 먼저 동기화를 시도해주세요.`;
        }
        if (!freshness.isStale) return '';
        return `${featureLabel}을 계속 진행할 수 있지만 최신 데이터가 ${freshness.behindBy}회차 뒤처져 있을 수 있습니다.`;
    },

    warnIfDataStale(featureLabel = '기능') {
        const message = this.getStaleDataMessage(featureLabel);
        if (message) {
            UIManager.toast(message, 'warning', 4200);
        }
        return this.getDataFreshness();
    }
};