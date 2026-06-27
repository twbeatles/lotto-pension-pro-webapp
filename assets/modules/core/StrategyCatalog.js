export { LEGACY_STRATEGY_ALIASES, AUTO_STRATEGY_IDS } from './strategyCatalog/aliases.js';
export { STRATEGY_CATALOG } from './strategyCatalog/entries.js';
export {
    resolveStrategyId,
    getStrategyMeta,
    isAutoStrategyId,
    listStrategies,
    createDefaultStrategyRequest
} from './strategyCatalog/api.js';