import { appModuleLoaderDataHealthMethods } from './moduleLoader/dataHealthGate.js';
import { appModuleLoaderRegistryMethods } from './moduleLoader/moduleRegistry.js';
import { appModuleLoaderRoutingMethods } from './moduleLoader/routing.js';
import { appModuleLoaderRequestBridgeMethods } from './moduleLoader/requestBridge.js';

export const appModuleLoaderMethods = {
    ...appModuleLoaderDataHealthMethods,
    ...appModuleLoaderRegistryMethods,
    ...appModuleLoaderRoutingMethods,
    ...appModuleLoaderRequestBridgeMethods
};
