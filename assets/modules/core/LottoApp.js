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
import { appNetworkLifecycleMethods } from './app/networkLifecycle.js';
import { appPwaInstallMethods } from './app/pwaInstall.js';
import { appMobileMoreSheetMethods } from './app/mobileMoreSheet.js';
import { appTargetDrawMethods } from './app/targetDraw.js';

export class LottoApp {
    constructor() {
        this.data = new DataManager();
        this.generator = null;
        this.stats = null;
        this.ai = null;
        this.check = null;
        this.dataIO = null;
        this.backtest = null;
        this.pension720 = null;
        this.qr = null;
        this.currentRoute = 'gen';
        this.moduleConstructors = {};
        this.pendingModulePromises = new Map();
        this.dataListDelegationBound = false;
        this.dataHealthActionsBound = false;
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
        this._remoteStateSyncTimer = null;
        this._remoteStateSyncKeys = new Set();
        this.AUTO_SYNC_MIN_INTERVAL_MS = 60000;
        this.NETWORK_PROBE_TIMEOUT_MS = 3200;
        this.OFFLINE_CONFIRM_RETRY_MS = 1200;
    }

    bindStepperButtons() {
        document.querySelectorAll('[data-step-target]').forEach((button) => {
            if (button.dataset.stepperBound === 'true') return;
            button.addEventListener('click', () => {
                const target = document.getElementById(button.dataset.stepTarget || '');
                const delta = Number(button.dataset.stepDelta || 0);
                if (!target || !Number.isFinite(delta) || delta === 0) return;

                const current = Number(target.value || target.getAttribute('value') || 0);
                const min = Number(target.min || Number.NEGATIVE_INFINITY);
                const max = Number(target.max || Number.POSITIVE_INFINITY);
                const next = Math.min(max, Math.max(min, current + delta));
                target.value = String(next);
                target.dispatchEvent(new Event('change', { bubbles: true }));
            });
            button.dataset.stepperBound = 'true';
        });
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

    async init() {
        startMark('app.init');
        if (this.data.setApp) this.data.setApp(this);

        UIManager.init();
        this.data.initCrossTabSync?.();
        this.data.load();
        this.applyTheme();

        this.generator = new GeneratorModule(this);

        this.cacheStaticSelectors();
        this.bindStepperButtons();
        this.bindTargetDrawInputs();

        this.bindNav();
        this.bindThemeToggle();
        this.bindSettingsModal();
        this.bindMobileMoreSheet();
        this.bindDataEvents();
        this.bindDataListDelegation();
        this.bindDataHealthActions();
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
        void this.data
            .fetchPension720Stats({ remote: true, preserveExistingOnFailure: true })
            .then(() => {
                if (this.currentRoute === 'pension720') this.pension720?.render?.();
            })
            .catch((error) => {
                console.warn('연금복권 데이터 초기 로드 실패', error);
            });

        const hasCustomProxy = Boolean(this.data.resolveProxyConfig()?.url);
        if (!latestLoaded || hasCustomProxy || this.data.getDataFreshness().availability !== 'full') {
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

Object.assign(
    LottoApp.prototype,
    appModuleLoaderMethods,
    appThemeMethods,
    appSettingsMethods,
    appDataListMethods,
    appLatestDrawMethods,
    appNetworkLifecycleMethods,
    appPwaInstallMethods,
    appMobileMoreSheetMethods,
    appTargetDrawMethods
);
