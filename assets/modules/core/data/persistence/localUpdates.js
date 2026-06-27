import { dataPersistenceLocalUpdateSyncMetaMethods } from './localUpdates/syncMeta.js';
import { dataPersistenceLocalUpdateSanitizeMethods } from './localUpdates/sanitize.js';
import { dataPersistenceLocalUpdateStorageMethods } from './localUpdates/storage.js';

export const dataPersistenceLocalUpdateMethods = {
    ...dataPersistenceLocalUpdateSyncMetaMethods,
    ...dataPersistenceLocalUpdateSanitizeMethods,
    ...dataPersistenceLocalUpdateStorageMethods
};