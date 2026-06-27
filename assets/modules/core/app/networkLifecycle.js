import { appNetworkLifecycleRemoteSyncMethods } from './networkLifecycle/remoteSync.js';
import { appNetworkLifecycleProbeMethods } from './networkLifecycle/networkProbe.js';
import { appNetworkLifecycleAutoSyncMethods } from './networkLifecycle/autoSync.js';
import { appNetworkLifecycleOfflineBannerMethods } from './networkLifecycle/offlineBanner.js';

export const appNetworkLifecycleMethods = {
    ...appNetworkLifecycleRemoteSyncMethods,
    ...appNetworkLifecycleProbeMethods,
    ...appNetworkLifecycleAutoSyncMethods,
    ...appNetworkLifecycleOfflineBannerMethods
};