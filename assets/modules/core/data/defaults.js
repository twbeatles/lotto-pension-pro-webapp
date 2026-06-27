import { dataDefaultsAlertPrefsMethods } from './defaults/alertPrefs.js';
import { dataDefaultsAppBindingMethods } from './defaults/appBinding.js';
import { dataDefaultsDataHealthMethods } from './defaults/dataHealth.js';
import { dataDefaultsDirtyMethods } from './defaults/dirty.js';
import { dataDefaultsPrefDefaultsMethods } from './defaults/prefDefaults.js';
import { dataDefaultsStrategyPresetsMethods } from './defaults/strategyPresets.js';
import { dataDefaultsStrategyPrefsMethods } from './defaults/strategyPrefs.js';
import { dataDefaultsSyncMetaMethods } from './defaults/syncMeta.js';

export const dataDefaultsMethods = {
    ...dataDefaultsDirtyMethods,
    ...dataDefaultsPrefDefaultsMethods,
    ...dataDefaultsDataHealthMethods,
    ...dataDefaultsSyncMetaMethods,
    ...dataDefaultsStrategyPrefsMethods,
    ...dataDefaultsAlertPrefsMethods,
    ...dataDefaultsStrategyPresetsMethods,
    ...dataDefaultsAppBindingMethods
};