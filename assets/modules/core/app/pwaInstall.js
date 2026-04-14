import { UIManager } from '../UIManager.js';
import { UI_STRINGS } from '../../utils/strings.js';

export const appPwaInstallMethods = {
    _bindPwaInstallPrompt() {
        this._syncPwaInstallButtons();

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this._pwaInstallPrompt = e;
            this._syncPwaInstallButtons();
        });

        window.addEventListener('appinstalled', () => {
            this._pwaInstallPrompt = null;
            this._syncPwaInstallButtons();
            UIManager.toast('앱이 홈 화면에 설치되었습니다.', 'success');
        });

        document.querySelectorAll('[data-pwa-install]').forEach((button) => {
            if (button.dataset.pwaBound === 'true') return;
            button.addEventListener('click', async () => {
                await this.handlePwaInstallRequest();
            });
            button.dataset.pwaBound = 'true';
        });
    },

    _syncPwaInstallButtons() {
        const showInstall = Boolean(this._pwaInstallPrompt);
        document.querySelectorAll('[data-pwa-install]').forEach((button) => {
            button.hidden = !showInstall;
        });
    },

    async handlePwaInstallRequest() {
        if (!this._pwaInstallPrompt) {
            UIManager.toast(UI_STRINGS.moreMenu.unavailableInstall, 'info');
            return false;
        }
        await this._pwaInstallPrompt.prompt();
        this._pwaInstallPrompt = null;
        this._syncPwaInstallButtons();
        return true;
    }
};
