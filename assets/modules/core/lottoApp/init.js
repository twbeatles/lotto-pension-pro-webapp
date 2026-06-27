import { GeneratorModule } from '../../features/Generator.js';
import { runWhenIdle } from '../../utils/loader.js';
import { endMark, startMark } from '../../utils/perf.js';
import { UIManager } from '../UIManager.js';

export const lottoAppInitMethods = {
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
};