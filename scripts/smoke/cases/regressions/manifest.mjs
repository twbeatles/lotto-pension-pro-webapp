import { coreStrategyPlan } from './plan/core-strategy.mjs';
import { recordsPlan } from './plan/records.mjs';
import { syncPlan } from './plan/sync.mjs';
import { pension720Plan } from './plan/pension720.mjs';
import { importRuntimePlan } from './plan/import-runtime.mjs';
import { uiAssetDocsPlan } from './plan/ui-assets-docs.mjs';

const regressionExecutionPlan = [
    ...coreStrategyPlan,
    ...recordsPlan,
    ...syncPlan,
    ...pension720Plan,
    ...importRuntimePlan,
    ...uiAssetDocsPlan
];

const regressionBarrelExportNames = [
    'runBacktestSmoke',
    'runBackupSmoke',
    ...regressionExecutionPlan.map(({ name }) => name)
];

export { regressionBarrelExportNames, regressionExecutionPlan };
