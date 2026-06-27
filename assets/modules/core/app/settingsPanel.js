import { appSettingsModalMethods } from './settings/modal.js';
import { appSettingsPanelMethods } from './settings/panel.js';
import { appSettingsFormatterMethods } from './settings/formatters.js';
import { appSettingsNotificationMethods } from './settings/notifications.js';

export const appSettingsMethods = {
    ...appSettingsModalMethods,
    ...appSettingsPanelMethods,
    ...appSettingsFormatterMethods,
    ...appSettingsNotificationMethods
};