import { LottoApp } from './lottoApp/constructor.js';
import { lottoAppStepperMethods } from './lottoApp/stepper.js';
import { lottoAppSessionMethods } from './lottoApp/session.js';
import { lottoAppInitMethods } from './lottoApp/init.js';
import { appModuleLoaderMethods } from './app/moduleLoader.js';
import { appThemeMethods } from './app/theme.js';
import { appSettingsMethods } from './app/settingsPanel.js';
import { appDataListMethods } from './app/dataLists.js';
import { appLatestDrawMethods } from './app/latestDraw.js';
import { appNetworkLifecycleMethods } from './app/networkLifecycle.js';
import { appPwaInstallMethods } from './app/pwaInstall.js';
import { appMobileMoreSheetMethods } from './app/mobileMoreSheet.js';
import { appTargetDrawMethods } from './app/targetDraw.js';

Object.assign(
    LottoApp.prototype,
    lottoAppStepperMethods,
    lottoAppSessionMethods,
    lottoAppInitMethods,
    appModuleLoaderMethods,
    appThemeMethods,
    appSettingsMethods,
    appDataListMethods,
    appLatestDrawMethods,
    appNetworkLifecycleMethods,
    appPwaInstallMethods,
    appMobileMoreSheetMethods,
    appTargetDrawMethods
);

export { LottoApp };