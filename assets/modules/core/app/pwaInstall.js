import { UIManager } from '../UIManager.js';
import { UI_STRINGS } from '../../utils/strings.js';

export const appPwaInstallMethods = {
    _bindPwaInstallPrompt() {
        this._syncPwaInstallButtons();
        this._bindPwaUpdateControls();

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
    },

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
    },

    async _refreshPwaCacheHealth() {
        if (typeof fetch !== 'function') return null;
        try {
            const response = await fetch('./__cache-health.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            this._pwaCacheHealth = {
                available: true,
                ok: payload?.ok !== false,
                cacheVersion: String(payload?.cacheVersion || ''),
                checkedAt: String(payload?.checkedAt || ''),
                failures: Array.isArray(payload?.failures) ? payload.failures : []
            };
        } catch (error) {
            this._pwaCacheHealth = {
                available: false,
                ok: false,
                cacheVersion: '',
                checkedAt: '',
                failures: [],
                message: String(error?.message || error || '')
            };
        }
        this.renderPwaCacheHealth?.();
        return this._pwaCacheHealth;
    },

    renderPwaCacheHealth() {
        const badge = document.getElementById('pwaCacheBadge');
        const note = document.getElementById('pwaCacheNote');
        if (!badge && !note) return;

        const health = this._pwaCacheHealth;
        let state = { label: 'pending', code: 'prompt' };
        let message = 'Cache health will be checked after the service worker is active.';
        if (health?.available) {
            const count = health.failures?.length || 0;
            state = count ? { label: `warning ${count}`, code: 'warning' } : { label: 'ok', code: 'success' };
            message = count
                ? `precache failed for ${count} asset(s). Check for an update, then review again.`
                : `precache completed${health.cacheVersion ? ` (${health.cacheVersion})` : ''}`;
        } else if (health) {
            state = { label: 'not ready', code: 'prompt' };
            message = 'Cache health is not readable yet. This can be normal immediately after install.';
        }

        if (badge) {
            badge.textContent = state.label;
            badge.className = `badge ${this.getStatusBadgeClass?.(state.code)}`;
        }
        if (note) note.textContent = message;
    }
};
