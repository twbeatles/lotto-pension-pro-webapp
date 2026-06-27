import { dataPersistenceLoadSavePendingMethods } from './loadSave/pending.js';
import { dataPersistenceLoadSaveLoadMethods } from './loadSave/load.js';
import { dataPersistenceLoadSaveSaveMethods } from './loadSave/save.js';

export const dataPersistenceLoadSaveMethods = {
    ...dataPersistenceLoadSavePendingMethods,
    ...dataPersistenceLoadSaveLoadMethods,
    ...dataPersistenceLoadSaveSaveMethods
};