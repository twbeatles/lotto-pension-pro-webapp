import { dataPersistenceProxyMethods } from './persistence/proxy.js';
import { dataPersistenceStorageMethods } from './persistence/storage.js';
import { dataPersistenceLocalUpdateMethods } from './persistence/localUpdates.js';
import { dataPersistenceLoadSaveMethods } from './persistence/loadSave.js';

export const dataPersistenceMethods = {
    ...dataPersistenceProxyMethods,
    ...dataPersistenceStorageMethods,
    ...dataPersistenceLocalUpdateMethods,
    ...dataPersistenceLoadSaveMethods
};
