import { $ } from '../../../../utils/utils.js';

export const appSettingsThemeSectionMethods = {
    renderSettingsThemeSection() {
        if (typeof document === 'undefined') return;
        const theme = this.data.state.theme === 'light' ? 'light' : 'dark';
        const themeBadge = $('#settingsThemeBadge');
        if (themeBadge) {
            themeBadge.textContent = theme === 'light' ? '라이트 모드' : '다크 모드';
            themeBadge.className = 'badge status-badge is-good';
        }

        const themeSummary = $('#settingsThemeSummary');
        if (themeSummary) {
            themeSummary.textContent =
                theme === 'light'
                    ? '밝은 배경으로 앱을 보고 있습니다. 빠른 전환 버튼과 동일한 설정입니다.'
                    : '눈부심을 줄이는 다크 모드를 사용 중입니다. 빠른 전환 버튼과 동일한 설정입니다.';
        }

        [
            ['#settingsThemeLight', 'light'],
            ['#settingsThemeDark', 'dark']
        ].forEach(([selector, value]) => {
            const button = $(selector);
            if (!button) return;
            const active = theme === value;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        const inApp = $('#alertEnableInApp');
        const system = $('#alertEnableSystem');
        const notify = $('#alertNotifyOnResult');
        if (inApp) inApp.checked = this.data.state.alertPrefs?.enableInApp !== false;
        if (system) system.checked = Boolean(this.data.state.alertPrefs?.enableSystemNotification);
        if (notify) notify.checked = this.data.state.alertPrefs?.notifyOnNewResult !== false;

        const permission = this.data.getNotificationPermissionState();
        const permissionBadge = $('#systemNotificationStatusBadge');
        if (permissionBadge) {
            permissionBadge.textContent = permission.label;
            permissionBadge.className = `badge ${this.getStatusBadgeClass(permission.code)}`;
        }
        const permissionHelp = $('#systemNotificationHelp');
        if (permissionHelp) {
            permissionHelp.textContent =
                permission.code === 'granted'
                    ? '브라우저 권한이 허용되어 있습니다.'
                    : permission.code === 'unsupported'
                      ? '현재 환경에서는 시스템 알림을 지원하지 않습니다.'
                      : '시스템 알림 토글을 켜면 권한을 요청합니다.';
        }
    }
};
