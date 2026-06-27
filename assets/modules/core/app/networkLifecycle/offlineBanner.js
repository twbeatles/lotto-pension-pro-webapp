import { UIManager } from '../../UIManager.js';

export const appNetworkLifecycleOfflineBannerMethods = {
    _bindOfflineBanner() {
        const banner = document.getElementById('offlineBanner');
        if (!banner) return;

        const applyState = (offline) => {
            banner.hidden = !offline;
            banner.setAttribute('aria-hidden', String(!offline));
        };

        const update = async ({ forceProbe = false } = {}) => {
            const offline = await this.isProbablyOffline({ forceProbe });
            applyState(offline);
            return offline;
        };

        void update({ forceProbe: true });

        window.addEventListener('online', async () => {
            applyState(false);
            UIManager.toast('인터넷에 다시 연결되었습니다.', 'success');
            this.queueAutoSync('online', { delayMs: 900, force: true });
        });

        window.addEventListener('offline', async () => {
            const offline = await update({ forceProbe: true });
            if (offline) {
                UIManager.toast('오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.', 'warning');
                return;
            }
            UIManager.toast('연결이 살아 있어 최신 데이터를 다시 확인합니다.', 'info');
            this.queueAutoSync('offline-false-positive', { delayMs: 900, force: true });
        });
    }
};