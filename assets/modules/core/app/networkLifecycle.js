import { UIManager } from '../UIManager.js';
import { CONFIG } from '../../utils/config.js';

export const appNetworkLifecycleMethods = {
    handleRemotePersistenceSync({ keys = [] } = {}) {
        const normalizedKeys = (Array.isArray(keys) ? keys : []).map((key) => String(key || '').trim()).filter(Boolean);
        if (!normalizedKeys.length) return;

        normalizedKeys.forEach((key) => this._remoteStateSyncKeys.add(key));
        if (this._remoteStateSyncTimer) return;

        this._remoteStateSyncTimer = setTimeout(() => {
            const pendingKeys = [...this._remoteStateSyncKeys];
            this._remoteStateSyncKeys.clear();
            this._remoteStateSyncTimer = null;
            void this._rehydrateAfterRemotePersistenceSync(pendingKeys);
        }, 80);
    },

    _syncLoadedModulesFromState() {
        this.generator?.applySavedStrategyPrefs?.();
        this.generator?.presetController?.render?.();
        this.ai?.applySavedStrategyPrefs?.();
        this.ai?.presetController?.render?.();
        this.ai?.renderModelGuide?.();
        this.backtest?.applySavedStrategyPrefs?.();
        this.backtest?.presetController?.render?.();
        this.pension720?.render?.();
    },

    async _rehydrateAfterRemotePersistenceSync(_keys = []) {
        const keySet = new Set(
            (Array.isArray(_keys) ? _keys : []).map((key) => String(key || '').trim()).filter(Boolean)
        );
        if (this.data.hasPendingLocalPersistence?.()) {
            const flushed = this.data.flushPendingLocalPersistence?.();
            if (flushed === false) {
                console.warn('[persistence] 원격 저장소 동기화를 보류했습니다. 로컬 저장 실패 상태가 남아 있습니다.');
                return;
            }
        }
        this.data.runWithBroadcastSuppressed?.(() => this.data.load());
        if (keySet.has(CONFIG.KEYS.LOCAL_UPDATES)) {
            await this.data.fetchWinningStats?.({ notifyTicketSettle: false });
        }
        this.applyTheme();
        this.renderSettingsPanel?.();
        this.updateLatestWin?.();
        this.bindTargetDrawInputs?.();
        this._syncLoadedModulesFromState?.();
        await this.refreshCurrentRoute?.();
        if (this.currentRoute === 'data') {
            this.renderDataLists?.();
        }
    },

    getNetworkProbeTargets() {
        const targets = [];
        const seen = new Set();
        const push = (label, url) => {
            const nextUrl = String(url || '').trim();
            if (!nextUrl || seen.has(nextUrl)) return;
            seen.add(nextUrl);
            targets.push({ label, url: nextUrl });
        };

        try {
            const sameOriginProbe = new URL('online-check.txt', window.location.href);
            sameOriginProbe.searchParams.set('__online_check', String(Date.now()));
            push('same-origin probe', sameOriginProbe.toString());
        } catch (_e) {
            // ignore location/url edge cases
        }

        const proxyConfig = this.data?.resolveProxyConfig?.();
        if (proxyConfig?.url) {
            try {
                const proxyUrl = new URL(proxyConfig.url);
                proxyUrl.searchParams.set('_network_probe', String(Date.now()));
                push(proxyConfig.source || '고급 연결 주소', proxyUrl.toString());
            } catch (_e) {
                // ignore malformed runtime value
            }
        }

        push('공식 로또 웹', 'https://www.dhlottery.co.kr/common.do?method=main');
        return targets;
    },

    async probeNetworkReachability({ force = false, retries = 1 } = {}) {
        if (this._networkProbePromise && !force) return this._networkProbePromise;

        const task = (async () => {
            const targets = this.getNetworkProbeTargets();
            if (!targets.length || typeof fetch !== 'function') {
                return typeof navigator === 'undefined' || navigator.onLine !== false;
            }

            for (let attempt = 0; attempt < Math.max(1, Number(retries) || 1); attempt++) {
                for (const target of targets) {
                    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    const timer = controller
                        ? setTimeout(() => controller.abort(), this.NETWORK_PROBE_TIMEOUT_MS)
                        : null;
                    try {
                        const response = await fetch(target.url, {
                            method: 'GET',
                            mode: target.label === 'same-origin probe' ? 'same-origin' : 'no-cors',
                            cache: 'no-store',
                            signal: controller?.signal
                        });
                        if (response) return true;
                    } catch (_e) {
                        // try next candidate
                    } finally {
                        if (timer) clearTimeout(timer);
                    }
                }

                if (attempt + 1 < retries) {
                    await new Promise((resolve) => setTimeout(resolve, this.OFFLINE_CONFIRM_RETRY_MS));
                }
            }

            return false;
        })().finally(() => {
            this._networkProbePromise = null;
        });

        this._networkProbePromise = task;
        return task;
    },

    async isProbablyOffline({ forceProbe = false } = {}) {
        if (typeof navigator === 'undefined') return false;
        if (navigator.onLine !== false) return false;
        const reachable = await this.probeNetworkReachability({
            force: forceProbe,
            retries: forceProbe ? 2 : 1
        });
        return !reachable;
    },

    queueAutoSync(reason = 'auto', { delayMs = 0, force = false } = {}) {
        this._autoSyncPendingForce = this._autoSyncPendingForce || Boolean(force);
        if (this._autoSyncTimer) {
            clearTimeout(this._autoSyncTimer);
            this._autoSyncTimer = null;
        }
        this._autoSyncTimer = setTimeout(
            () => {
                this._autoSyncTimer = null;
                const nextForce = this._autoSyncPendingForce;
                this._autoSyncPendingForce = false;
                this.runAutoSync({ reason, force: nextForce });
            },
            Math.max(0, Number(delayMs) || 0)
        );
    },

    async runAutoSync({ reason = 'auto', force = false } = {}) {
        const now = Date.now();
        if (!force && now - this._lastAutoSyncAt < this.AUTO_SYNC_MIN_INTERVAL_MS) {
            return false;
        }
        if (await this.isProbablyOffline()) {
            return false;
        }

        this._lastAutoSyncAt = now;
        return this.data.fetchLatestFromAPI({
            silent: true,
            trigger: 'auto',
            reason
        });
    },

    _bindAutoSyncLifecycle() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.queueAutoSync('resume', { delayMs: 1200 });
            }
        });
    },

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
