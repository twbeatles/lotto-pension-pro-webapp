import { appSettingsThemeSectionMethods } from './panel/themeSection.js';
import { appSettingsStorageSectionMethods } from './panel/storageSection.js';
import { appSettingsProxySectionMethods } from './panel/proxySection.js';
import { appSettingsSyncSectionMethods } from './panel/syncSection.js';

export const appSettingsPanelMethods = {
    ...appSettingsThemeSectionMethods,
    ...appSettingsStorageSectionMethods,
    ...appSettingsProxySectionMethods,
    ...appSettingsSyncSectionMethods,

    renderSettingsPanel() {
        if (typeof document === 'undefined') return;
        this.renderSettingsThemeSection();
        this.renderSettingsStorageSection();
        this.renderSettingsProxySection();
        this.renderSettingsSyncSection();

        this.renderPwaUpdateState?.();
        this.updateStorageFailureBanner?.();
    }
};
