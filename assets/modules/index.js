import { registerPwaLifecycle } from './bootstrap/pwa.js';
import { LottoApp } from './core/LottoApp.js';

registerPwaLifecycle();

// Boot watchdog: if the app never reaches its first route, the tabs stay
// unbound and the shell sits on "loading" forever with no error. Surface that
// instead of leaving a silently dead screen.
const BOOT_WATCHDOG_MS = 20000;
let bootWatchdogId = 0;

function hideBootNotice() {
    document.getElementById('bootNotice')?.remove();
}

function showBootNotice(message) {
    if (document.getElementById('bootNotice')) return;
    const notice = document.createElement('div');
    notice.id = 'bootNotice';
    notice.className = 'update-toast boot-notice';
    notice.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = message;
    const reloadBtn = document.createElement('button');
    reloadBtn.id = 'bootReloadBtn';
    reloadBtn.type = 'button';
    reloadBtn.textContent = '새로고침';
    reloadBtn.addEventListener('click', () => window.location.reload());
    const dismissBtn = document.createElement('button');
    dismissBtn.id = 'bootDismissBtn';
    dismissBtn.type = 'button';
    dismissBtn.textContent = '닫기';
    dismissBtn.addEventListener('click', hideBootNotice);
    notice.append(text, reloadBtn, dismissBtn);
    document.body.appendChild(notice);
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new LottoApp();
    window.clearTimeout(bootWatchdogId);
    bootWatchdogId = window.setTimeout(() => {
        // A started first route binds the tabs; only warn when routing never ran.
        if (window.app?.routeToken > 0) return;
        showBootNotice(
            '앱 시작이 지연되고 있습니다. 광고 차단·스크립트 차단 확장을 끈 뒤 새로고침해 보세요.'
        );
    }, BOOT_WATCHDOG_MS);
    window.app.init().then(
        () => {
            window.clearTimeout(bootWatchdogId);
            hideBootNotice();
        },
        (error) => {
            window.clearTimeout(bootWatchdogId);
            console.error('앱 초기화 실패:', error);
            showBootNotice(
                '앱을 시작하지 못했습니다. 새로고침 후에도 계속되면 확장 프로그램을 끄고 다시 시도해 주세요.'
            );
        }
    );
});
