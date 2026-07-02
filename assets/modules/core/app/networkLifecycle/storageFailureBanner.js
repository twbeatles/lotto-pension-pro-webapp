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
                    `저장 실패가 감지되었습니다 (${latest.key || 'localStorage'}). 설정에서 백업 후 데이터를 정리해 주세요.`
                );
                return;
            }
            if (pendingDirty) {
                applyState(true, '저장 대기 중인 변경 사항이 아직 기록되지 않았습니다. 탭을 닫기 전에 잠시 기다려 주세요.');
                return;
            }
            applyState(false);
        };

        this.updateStorageFailureBanner = update;
        update();
        window.addEventListener('storage', update);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') update();
        });
    }
};