import { UIManager } from '../../UIManager.js';

export const appSettingsNotificationMethods = {
    async handleSystemNotificationToggle(enabled) {
        if (!enabled) {
            this.data.setAlertPrefs({ enableSystemNotification: false });
            this.renderSettingsPanel?.();
            this.renderDataLists?.();
            return;
        }

        const permission = await this.data.requestNotificationPermission();
        if (permission.code === 'granted') {
            this.data.setAlertPrefs({ enableSystemNotification: true });
            UIManager.toast('시스템 알림이 활성화되었습니다.', 'success');
        } else {
            this.data.setAlertPrefs({ enableSystemNotification: false });
            UIManager.toast(
                permission.code === 'unsupported'
                    ? '이 브라우저는 시스템 알림을 지원하지 않습니다.'
                    : '시스템 알림 권한이 필요합니다.',
                permission.code === 'unsupported' ? 'warning' : 'info'
            );
        }
        this.renderSettingsPanel?.();
        this.renderDataLists?.();
    },

    async handleTestSystemNotification() {
        let permission = this.data.getNotificationPermissionState();
        if (permission.code === 'unsupported') {
            UIManager.toast('이 브라우저는 시스템 알림을 지원하지 않습니다.', 'warning');
            this.renderSettingsPanel?.();
            this.renderDataLists?.();
            return;
        }
        if (permission.code !== 'granted') {
            permission = await this.data.requestNotificationPermission();
        }
        if (permission.code !== 'granted') {
            UIManager.toast('테스트 알림을내려면 시스템 알림 권한이 필요합니다.', 'info');
            this.renderSettingsPanel?.();
            this.renderDataLists?.();
            return;
        }
        this.data.sendTestSystemNotification();
        UIManager.toast('테스트 알림을 보냈습니다.', 'success');
        this.renderSettingsPanel?.();
        this.renderDataLists?.();
    }
};