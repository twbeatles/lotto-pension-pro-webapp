import { UIManager } from '../../UIManager.js';

export const appPwaInstallUpdateControlMethods = {
    _bindPwaUpdateControls() {
        if (this._pwaUpdateControlsBound || typeof window === 'undefined') return;
        this._pwaUpdateControlsBound = true;

        window.addEventListener('lotto:pwa-update-state', (event) => {
            this.renderPwaUpdateState?.(event.detail);
        });
        this._refreshPwaCacheHealth?.();

        const bindButton = () => {
            const button = document.getElementById('pwaUpdateCheckBtn');
            if (!button || button.dataset.pwaUpdateBound === 'true') return;
            button.addEventListener('click', async () => {
                const api = window.lottoPwaUpdate;
                if (!api) {
                    UIManager.toast('이 브라우저에서는 앱 업데이트 확인을 지원하지 않습니다.', 'info');
                    return;
                }
                const state = api.getState();
                if (state.updateReady) {
                    if (!api.apply()) {
                        UIManager.toast('적용할 업데이트가 없습니다.', 'info');
                    }
                    return;
                }
                UIManager.toast('앱 업데이트를 확인합니다.', 'info');
                const result = await api.check();
                if (!result.updateReady) UIManager.toast('현재 앱 버전이 최신입니다.', 'success');
            });
            button.dataset.pwaUpdateBound = 'true';
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindButton, { once: true });
        } else {
            bindButton();
        }
    },

    renderPwaUpdateState(state = window.lottoPwaUpdate?.getState?.() || {}) {
        const normalized = {
            updateReady: Boolean(state.updateReady),
            checking: Boolean(state.checking)
        };
        const badge = document.getElementById('pwaUpdateBadge');
        const button = document.getElementById('pwaUpdateCheckBtn');
        const note = document.getElementById('pwaUpdateNote');

        if (badge) {
            badge.textContent = normalized.updateReady ? '업데이트 준비됨' : normalized.checking ? '확인 중' : '최신';
            badge.className = `badge ${this.getStatusBadgeClass?.(
                normalized.updateReady ? 'warning' : normalized.checking ? 'prompt' : 'success'
            )}`;
        }
        if (button) {
            button.disabled = normalized.checking;
            button.innerHTML = normalized.updateReady
                ? '<i class="ph ph-arrow-clockwise"></i> 준비된 업데이트 적용'
                : normalized.checking
                  ? '<i class="ph ph-spinner ph-spin"></i> 확인 중'
                  : '<i class="ph ph-arrows-clockwise"></i> 앱 업데이트 확인';
        }
        if (note) {
            note.textContent = normalized.updateReady
                ? '새 앱 버전이 준비되었습니다. 지금 적용하면 화면이 한 번 새로고침됩니다.'
                : '필요할 때만 화면이 새로고침됩니다.';
        }
        this.renderPwaCacheHealth?.();
    }
};