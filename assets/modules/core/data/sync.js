import { dataSyncHealthMethods } from './sync/health.js';
import { dataSyncHttpMethods } from './sync/http.js';
import { dataSyncPayloadMethods } from './sync/payload.js';
import { dataSyncProviderMethods } from './sync/providers.js';
import { dataSyncRangeMethods } from './sync/range.js';
import { dataSyncOrchestratorMethods } from './sync/orchestrator.js';

export const dataSyncMethods = {
    ...dataSyncHealthMethods,
    ...dataSyncHttpMethods,
    ...dataSyncPayloadMethods,
    ...dataSyncProviderMethods,
    ...dataSyncRangeMethods,
    ...dataSyncOrchestratorMethods
};
