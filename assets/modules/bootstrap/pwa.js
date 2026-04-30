const SW_UPDATE_CHANNEL = 'lotto-sw-update';

export function registerPwaLifecycle() {
    if (!('serviceWorker' in navigator)) return;

    // BroadcastChannel: SW 업데이트 수락 신호를 모든 탭에 전파
    let updateChannel = null;
    const channelClientId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            updateChannel = new BroadcastChannel(SW_UPDATE_CHANNEL);
            updateChannel.addEventListener('message', (e) => {
                if (e.data?.type === 'SW_ACTIVATED' && e.data?.senderId !== channelClientId) {
                    // 다른 탭에서 새 워커 활성화가 끝난 뒤에만 새로고침
                    window.location.reload();
                }
            });
        }
    } catch (_e) {
        updateChannel = null;
    }

    const registerSW = () => {
        navigator.serviceWorker
            .register('sw.js', { updateViaCache: 'none' })
            .then((reg) => {
                console.log('서비스 워커 등록 완료:', reg.scope);
                if (reg.waiting && navigator.serviceWorker.controller) {
                    showUpdateToast(reg.waiting);
                }
                reg.update().catch(() => {});

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateToast(newWorker);
                        }
                    });
                });
            })
            .catch((err) => console.log('서비스 워커 등록 실패:', err));
    };

    let reloadOnControllerChange = false;
    let updateToast = null;
    const showUpdateToast = (worker) => {
        if (!worker || updateToast) return;
        const toast = document.createElement('div');
        toast.className = 'update-toast';
        toast.innerHTML = `
            <span>새 버전이 준비되었습니다.</span>
            <button id="reloadBtn">업데이트</button>
            <button id="dismissBtn">닫기</button>
        `;
        document.body.appendChild(toast);
        updateToast = toast;

        const reloadBtn = document.getElementById('reloadBtn');
        const dismissBtn = document.getElementById('dismissBtn');
        if (reloadBtn) {
            reloadBtn.onclick = () => {
                reloadOnControllerChange = true;
                worker.postMessage({ action: 'skipWaiting' });
            };
        }
        if (dismissBtn) {
            dismissBtn.onclick = () => {
                updateToast?.remove();
                updateToast = null;
            };
        }
        worker.addEventListener('statechange', () => {
            if (worker.state === 'activating' || worker.state === 'activated' || worker.state === 'redundant') {
                updateToast?.remove();
                updateToast = null;
            }
        });
    };

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing || !reloadOnControllerChange) return;
        refreshing = true;
        try {
            updateChannel?.postMessage({ type: 'SW_ACTIVATED', senderId: channelClientId });
        } catch (_e) {
            // 채널 전송 실패는 무시
        }
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
