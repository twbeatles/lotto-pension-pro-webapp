import { createDefaultPension720StrategyRequest } from '../../Pension720StrategyCatalog.js';
import { createDefaultStrategyRequest } from '../../StrategyCatalog.js';

export const dataDefaultsPrefDefaultsMethods = {
    getDefaultStrategyPrefs() {
        return {
            generator: createDefaultStrategyRequest('ensemble_weighted'),
            ai: createDefaultStrategyRequest('ensemble_weighted'),
            backtest: createDefaultStrategyRequest('random_baseline'),
            pension720: createDefaultPension720StrategyRequest('mixed_balance')
        };
    },

    getDefaultAlertPrefs() {
        return {
            enableInApp: true,
            enableSystemNotification: false,
            notifyOnNewResult: true
        };
    }
};