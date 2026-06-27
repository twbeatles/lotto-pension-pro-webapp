import { dataSyncOrchestratorFetchWinningStatsMethods } from './orchestrator/fetchWinningStats.js';
import { dataSyncOrchestratorFetchLatestApiMethods } from './orchestrator/fetchLatestApi.js';

export const dataSyncOrchestratorMethods = {
    ...dataSyncOrchestratorFetchWinningStatsMethods,
    ...dataSyncOrchestratorFetchLatestApiMethods
};