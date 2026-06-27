import { appDataListBindDataEventMethods } from './events/bindDataEvents.js';
import { appDataListBindPersistenceEventMethods } from './events/bindPersistenceEvents.js';
import { appDataListBindDelegationEventMethods } from './events/bindDataListDelegation.js';

export const appDataListEventMethods = {
    ...appDataListBindDataEventMethods,
    ...appDataListBindPersistenceEventMethods,
    ...appDataListBindDelegationEventMethods
};