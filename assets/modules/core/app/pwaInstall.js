import { appPwaInstallPromptMethods } from './pwaInstall/installPrompt.js';
import { appPwaInstallUpdateControlMethods } from './pwaInstall/updateControls.js';
import { appPwaInstallCacheHealthMethods } from './pwaInstall/cacheHealth.js';

export const appPwaInstallMethods = {
    ...appPwaInstallPromptMethods,
    ...appPwaInstallUpdateControlMethods,
    ...appPwaInstallCacheHealthMethods
};