export const appNetworkLifecycleStorageFailureBannerMethods = {
    _bindStorageFailureBanner() {
        const banner = document.getElementById('storageFailureBanner');
        if (!banner) return;

        const applyState = (visible, message = '') => {
            banner.hidden = !visible;
            banner.setAttribute('aria-hidden', String(!visible));
            if (visible && message) banner.textContent = message;
        };

        const update = () => {
            const failures = this.data.getStorageWriteFailures?.() || [];
            const pendingDirty = this.data.hasPendingLocalPersistence?.() || false;
            if (failures.length) {
                const latest = failures[0];
                applyState(
                    true,
                    `번호를 기기에 저장하지 못했어요${latest.key ? ` (${latest.key})` : ''}. 설정에서 백업한 뒤 오래된 기록을 정리해 주세요.`
                );
                return;
            }
            if (pendingDirty) {
                applyState(true, '아직 저장 중이에요. 창을 닫기 전에 잠시만 기다려 주세요.');
                return;
            }
            applyState(false);
        };

        this.updateStorageFailureBanner = update;
        update();
        window.addEventListener('storage', update);
        window.addEventListener('lotto:persistence-saved', update);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') update();
        });
    }
};