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
        this._pwaInstallPrompt = null;
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

    _bindOfflineBanner() {
        const banner = document.getElementById('offlineBanner');
        if (!banner) return;
        const update = () => {
            const offline = !navigator.onLine;
            banner.hidden = !offline;
            banner.setAttribute('aria-hidden', String(!offline));
        };
        update();
        window.addEventListener('online', () => {
            update();
            UIManager.toast('인터넷에 다시 연결되었습니다.', 'success');
        });
        window.addEventListener('offline', () => {
            update();
            UIManager.toast('오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.', 'warning');
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

    async init() {
        startMark('app.init');
        if (this.data.setApp) this.data.setApp(this);

        this.data.load();
        this.applyTheme();

        this.generator = new GeneratorModule(this);

        this.cacheStaticSelectors();

        this.bindNav();
        this.bindThemeToggle();
        this.bindSettingsModal();
        this.bindDataEvents();
        this.bindDataListDelegation();
        this.bindPersistenceEvents();
        this._bindOfflineBanner();
        this._bindPwaInstallPrompt();
        this.renderSettingsPanel();

        await this.route('gen');

        let latestLoaded = false;
        try {
            latestLoaded = await this.data.fetchWinningStats();
        } catch (error) {
            console.error('당첨 데이터 로드 실패:', error);
        }
        this.updateLatestWin({ offline: !latestLoaded });

        runWhenIdle(() => {
            this.data.fetchLatestFromAPI({ silent: true, trigger: 'idle' });
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
