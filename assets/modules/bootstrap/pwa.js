const SW_UPDATE_CHANNEL = 'lotto-sw-update';

export function registerPwaLifecycle() {
    if (!('serviceWorker' in navigator)) return;

    // BroadcastChannel: SW 업데이트 수락 신호를 모든 탭에 전파
    let updateChannel = null;
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            updateChannel = new BroadcastChannel(SW_UPDATE_CHANNEL);
            updateChannel.addEventListener('message', (e) => {
                if (e.data?.type === 'SW_UPDATED') {
                    // 다른 탭에서 업데이트를 수락했으면 이 탭도 새로고침
                    window.location.reload();
                }
            });
        }
    } catch (_e) {
        updateChannel = null;
    }

    const registerSW = () => {
        navigator.serviceWorker.register('sw.js').then((reg) => {
            console.log('서비스 워커 등록 완료:', reg.scope);

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateToast(newWorker);
                    }
                });
            });
        }).catch((err) => console.log('서비스 워커 등록 실패:', err));
    };

    let reloadOnControllerChange = false;
    const showUpdateToast = (worker) => {
        const toast = document.createElement('div');
        toast.className = 'update-toast';
        toast.innerHTML = `
            <span>새 버전이 준비되었습니다.</span>
            <button id="reloadBtn">업데이트</button>
            <button id="dismissBtn">닫기</button>
        `;
        document.body.appendChild(toast);

        const reloadBtn = document.getElementById('reloadBtn');
        const dismissBtn = document.getElementById('dismissBtn');
        if (reloadBtn) {
            reloadBtn.onclick = () => {
                reloadOnControllerChange = true;
                // 다른 탭에도 업데이트 신호 전파
                try { updateChannel?.postMessage({ type: 'SW_UPDATED' }); } catch (_e) { /* 채널 전송 실패 무시 */ }
                worker.postMessage({ action: 'skipWaiting' });
            };
        }
        if (dismissBtn) {
            dismissBtn.onclick = () => toast.remove();
        }
    };

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing || !reloadOnControllerChange) return;
        refreshing = true;
        window.location.reload();
    });

    window.addEventListener('load', () => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(registerSW, { timeout: 1200 });
        } else {
            setTimeout(registerSW, 250);
        }
    });
}
