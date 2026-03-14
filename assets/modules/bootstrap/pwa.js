export function registerPwaLifecycle() {
    if ('serviceWorker' in navigator) {
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
}
