import { getStrategyMeta, resolveStrategyId } from '../../../core/StrategyCatalog.js';

export const backtestRenderingLabelMethods = {
    getPayoutModeLabel(mode) {
        return mode === 'fast_fixed' ? '고정 상금' : '하이브리드 동적 1등';
    },

    getStrategyLabel(strategyId) {
        return getStrategyMeta(resolveStrategyId(strategyId)).label;
    }
};