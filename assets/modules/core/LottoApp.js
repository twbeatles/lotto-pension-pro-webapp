import { DataManager } from './DataManager.js';
import { GeneratorModule } from '../features/Generator.js';
import { runWhenIdle } from '../utils/loader.js';
import { endMark, startMark } from '../utils/perf.js';
import { StrategyWorkerClient } from './StrategyWorkerClient.js';
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
        this.dataListState = {
            fav: { query: '', page: 1 },
            history: { query: '', page: 1 },
            ticket: { query: '', page: 1 },
            campaign: { query: '', page: 1 }
        };
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
        this.renderSettingsPanel();

        await this.route('gen');

        let latestLoaded = false;
        try {
            latestLoaded = await this.data.fetchWinningStats();
        } catch (error) {
            console.error('??? ???????? ???:', error);
        }
        this.updateLatestWin({ offline: !latestLoaded });

        runWhenIdle(() => {
            this.data.fetchLatestFromAPI({ silent: true, trigger: 'idle' });
        });

        await this.refreshCurrentRoute();
        this.preloadLikelyModules();

        endMark('app.init');
        console.log('??????????');
    }
}

Object.assign(LottoApp.prototype,
    appModuleLoaderMethods,
    appThemeMethods,
    appSettingsMethods,
    appDataListMethods,
    appLatestDrawMethods
);
