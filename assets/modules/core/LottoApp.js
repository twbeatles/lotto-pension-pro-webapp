import { DataManager } from './DataManager.js';
import { GeneratorModule } from '../features/Generator.js';
import { runWhenIdle } from '../utils/loader.js';
import { endMark, startMark } from '../utils/perf.js';
import { StrategyWorkerClient } from './StrategyWorkerClient.js';
import { UIManager } from './UIManager.js';
import { CONFIG } from '../utils/config.js';
import { appModuleLoaderMethods } from './app/moduleLoader.js';
import { appThemeMethods } from './app/theme.js';
import { appSettingsMethods } from './app/settingsPanel.js';
import { appDataListMethods } from './app/dataLists.js';
import { appLatestDrawMethods } from './app/latestDraw.js';

export class LottoApp {
    constructor() {
        this.data = new DataManager();
        this.generator = null;
        this.stats = null;
        this.ai = null;
        this.check = null;
        this.dataIO = null;
        this.backtest = null;
        this.qr = null;
        this.currentRoute = 'gen';
        this.moduleConstructors = {};
        this.pendingModulePromises = new Map();
        this.dataListDelegationBound = false;
        this.routeToken = 0;
        this.navItems = [];
        this.pageItems = [];
        this.navByTarget = new Map();
        this.strategyWorker = new StrategyWorkerClient();
        this.dataListRenderToken = 0;
        this.dateFormatter = new Intl.DateTimeFormat('ko-KR');
        this.dataListPageSize = 20;
        this.dataListState = this._loadDataListStateFromSession();
        this.targetDrawInputIds = ['genTargetDrawNo', 'campStartDraw', 'aiTargetDrawNo'];
        this._pwaInstallPrompt = null;
        this._networkProbePromise = null;
        this._autoSyncTimer = null;
        this._autoSyncPendingForce = false;
        this._lastAutoSyncAt = 0;
        this.AUTO_SYNC_MIN_INTERVAL_MS = 60000;
        this.NETWORK_PROBE_TIMEOUT_MS = 3200;
        this.OFFLINE_CONFIRM_RETRY_MS = 1200;
    }

    _loadDataListStateFromSession() {
        const defaults = {
            fav: { query: '', page: 1 },
            history: { query: '', page: 1 },
            ticket: { query: '', page: 1 },
            campaign: { query: '', page: 1 }
        };
        try {
            if (typeof sessionStorage === 'undefined') return defaults;
            const raw = sessionStorage.getItem(CONFIG.KEYS.SESSION_DATA_LIST_STATE);
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;
            // 각 scope를 defaults와 병합해 누락 필드 방지
            return Object.fromEntries(
                Object.keys(defaults).map((scope) => [
                    scope,
                    {
                        query: typeof parsed[scope]?.query === 'string' ? parsed[scope].query : '',
                        page: Math.max(1, Number(parsed[scope]?.page) || 1)
                    }
                ])
            );
        } catch (_e) {
            return defaults;
        }
    }

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
            const sameOriginProbe = new URL('manifest.json', window.location.href);
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
                push(proxyConfig.source || '사용자 프록시', proxyUrl.toString());
            } catch (_e) {
                // ignore malformed runtime value
            }
        }

        push('공식 로또 웹', 'https://www.dhlottery.co.kr/common.do?method=main');
        return targets;
    }

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
    }

    async isProbablyOffline({ forceProbe = false } = {}) {
        if (typeof navigator === 'undefined') return false;
        if (navigator.onLine !== false) return false;
        const reachable = await this.probeNetworkReachability({
            force: forceProbe,
            retries: forceProbe ? 2 : 1
        });
        return !reachable;
    }

    queueAutoSync(reason = 'auto', { delayMs = 0, force = false } = {}) {
        this._autoSyncPendingForce = this._autoSyncPendingForce || Boolean(force);
        if (this._autoSyncTimer) {
            clearTimeout(this._autoSyncTimer);
            this._autoSyncTimer = null;
        }
        this._autoSyncTimer = setTimeout(() => {
            this._autoSyncTimer = null;
            const nextForce = this._autoSyncPendingForce;
            this._autoSyncPendingForce = false;
            this.runAutoSync({ reason, force: nextForce });
        }, Math.max(0, Number(delayMs) || 0));
    }

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
    }

    _bindAutoSyncLifecycle() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.queueAutoSync('resume', { delayMs: 1200 });
            }
        });
    }

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

    _bindPwaInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this._pwaInstallPrompt = e;
            const btn = document.getElementById('pwaInstallBtn');
            if (btn) btn.hidden = false;
        });

        window.addEventListener('appinstalled', () => {
            this._pwaInstallPrompt = null;
            const btn = document.getElementById('pwaInstallBtn');
            if (btn) btn.hidden = true;
            UIManager.toast('앱이 홈 화면에 설치되었습니다.', 'success');
        });

        document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
            if (!this._pwaInstallPrompt) return;
            await this._pwaInstallPrompt.prompt();
            this._pwaInstallPrompt = null;
            const btn = document.getElementById('pwaInstallBtn');
            if (btn) btn.hidden = true;
        });
    }

    getSuggestedNextDrawNo() {
        const latest = Number(this.data.state.winningStats?.[0]?.draw_no || 0);
        return Math.max(1, Math.floor(latest + 1) || 1);
    }

    setTargetDrawInputValue(id, value, { force = false, userEdited = false } = {}) {
        const el = document.getElementById(id);
        if (!el) return false;

        const nextValue = String(Math.max(1, Math.floor(Number(value) || 1)));
        const currentValue = String(el.value || '').trim();
        const lastAutoValue = String(el.dataset.lastAutoValue || '').trim();
        const autoManaged = el.dataset.userEdited !== 'true' || !currentValue || currentValue === lastAutoValue;

        if (!force && !autoManaged) return false;
        if (currentValue === nextValue && lastAutoValue === nextValue && el.dataset.userEdited === String(userEdited)) {
            return false;
        }

        el.dataset.autoApplying = 'true';
        el.value = nextValue;
        el.dataset.lastAutoValue = nextValue;
        el.dataset.userEdited = userEdited ? 'true' : 'false';
        delete el.dataset.autoApplying;
        return true;
    }

    resetTargetDrawInputs(ids = this.targetDrawInputIds, { toast = true } = {}) {
        const nextDrawNo = this.getSuggestedNextDrawNo();
        let changed = 0;
        (Array.isArray(ids) ? ids : []).forEach((id) => {
            if (this.setTargetDrawInputValue(id, nextDrawNo, { force: true, userEdited: false })) {
                changed++;
            }
        });
        if (toast) {
            UIManager.toast(
                changed > 0 ? '다음 회차 기본값으로 재설정했습니다.' : '이미 다음 회차 기준으로 설정되어 있습니다.',
                changed > 0 ? 'success' : 'info'
            );
        }
        return changed;
    }

    bindTargetDrawInputs() {
        const nextDrawNo = this.getSuggestedNextDrawNo();

        this.targetDrawInputIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;

            if (el.dataset.targetDrawBound !== 'true') {
                const markUserEdited = () => {
                    if (el.dataset.autoApplying === 'true') return;
                    el.dataset.userEdited = 'true';
                };
                el.addEventListener('input', markUserEdited);
                el.addEventListener('change', markUserEdited);
                el.dataset.targetDrawBound = 'true';
            }

            this.setTargetDrawInputValue(id, nextDrawNo, { force: false, userEdited: false });
        });

        document.querySelectorAll('[data-reset-target-draw]').forEach((button) => {
            if (button.dataset.boundResetTargetDraw === 'true') return;
            button.addEventListener('click', () => {
                const ids = String(button.dataset.targetDrawIds || '')
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                this.resetTargetDrawInputs(ids.length ? ids : this.targetDrawInputIds);
            });
            button.dataset.boundResetTargetDraw = 'true';
        });
    }

    async init() {
        startMark('app.init');
        if (this.data.setApp) this.data.setApp(this);

        this.data.load();
        this.applyTheme();

        this.generator = new GeneratorModule(this);

        this.cacheStaticSelectors();
        this.bindTargetDrawInputs();

        this.bindNav();
        this.bindThemeToggle();
        this.bindSettingsModal();
        this.bindDataEvents();
        this.bindDataListDelegation();
        this.bindPersistenceEvents();
        this._bindOfflineBanner();
        this._bindAutoSyncLifecycle();
        this._bindPwaInstallPrompt();
        this.renderSettingsPanel();

        await this.route('gen');

        let latestLoaded = false;
        try {
            latestLoaded = await this.data.fetchWinningStats();
        } catch (error) {
            console.error('당첨 데이터 로드 실패:', error);
        }
        this.updateLatestWin({ offline: !latestLoaded && Boolean(this.data.lastWinningStatsLoad?.offline) });

        const hasCustomProxy = Boolean(this.data.resolveProxyConfig()?.url);
        if (!latestLoaded || hasCustomProxy) {
            this.queueAutoSync(hasCustomProxy ? 'proxy-bootstrap' : 'bootstrap-recovery', {
                delayMs: latestLoaded ? 400 : 150,
                force: true
            });
        }

        runWhenIdle(() => {
            this.queueAutoSync('idle');
        });

        await this.refreshCurrentRoute();
        this.preloadLikelyModules();

        endMark('app.init');
        console.log('앱 초기화 완료');
    }
}

Object.assign(LottoApp.prototype,
    appModuleLoaderMethods,
    appThemeMethods,
    appSettingsMethods,
    appDataListMethods,
    appLatestDrawMethods
);
