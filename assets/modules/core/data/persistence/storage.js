import { dataPersistenceStorageCrossTabMethods } from './storage/crossTab.js';
import { dataPersistenceStorageWriteHealthMethods } from './storage/writeHealth.js';
import { dataPersistenceStorageTempResultsMethods } from './storage/tempResults.js';
import { dataPersistenceStoragePersistMethods } from './storage/persist.js';
import { dataPersistenceStorageSummaryMethods } from './storage/summary.js';

export {
    STORAGE_SYNC_CHANNEL,
    APP_OWNED_STORAGE_KEYS,
    createTabInstanceId,
    getUtf8ByteLength
} from './storage/constants.js';

export const dataPersistenceStorageMethods = {
    ...dataPersistenceStorageCrossTabMethods,
    ...dataPersistenceStorageWriteHealthMethods,
    ...dataPersistenceStorageTempResultsMethods,
    ...dataPersistenceStoragePersistMethods,
    ...dataPersistenceStorageSummaryMethods
};