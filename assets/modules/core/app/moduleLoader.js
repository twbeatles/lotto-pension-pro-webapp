import { $, $$ } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
import { runWhenIdle } from '../../utils/loader.js';
import { endMark, startMark } from '../../utils/perf.js';
export const appModuleLoaderMethods = {
    cacheStaticSelectors() {
        this.navItems = Array.from($$('.nav-item'));
        this.pageItems = Array.from($$('.page'));
        this.navByTarget.clear();
        this.navItems.forEach((el) => {
            const target = el.dataset.target;
            if (!target) return;
            if (!this.navByTarget.has(target)) this.navByTarget.set(target, []);
            this.navByTarget.get(target).push(el);
        });
    },

    async ensureModule(name) {
        if (this[name]) return this[name];
        if (this.pendingModulePromises.has(name)) {
            return this.pendingModulePromises.get(name);
        }

        const loadPromise = (async () => {
            if (!this.moduleConstructors[name]) {
                if (name === 'stats') {
                    const mod = await import('../../features/Stats.js');
                    this.moduleConstructors[name] = mod.StatsModule;
                } else if (name === 'ai') {
                    const mod = await import('../../features/Ai.js');
                    this.moduleConstructors[name] = mod.AiModule;
                } else if (name === 'check') {
                    const mod = await import('../../features/Check.js');
                    this.moduleConstructors[name] = mod.CheckModule;
                } else if (name === 'dataIO') {
                    const mod = await import('../../features/DataIO.js');
                    this.moduleConstructors[name] = mod.DataIOModule;
                } else if (name === 'backtest') {
                    const mod = await import('../../features/Backtest.js');
                    this.moduleConstructors[name] = mod.BacktestModule;
                } else if (name === 'qr') {
                    const mod = await import('../../features/QrScanner.js');
                    this.moduleConstructors[name] = mod.QrScannerModule;
                }
            }

            const Ctor = this.moduleConstructors[name];
            if (!Ctor) return null;
            if (!this[name]) this[name] = new Ctor(this);
            return this[name];
        })();

        this.pendingModulePromises.set(name, loadPromise);
        try {
            return await loadPromise;
        } finally {
            this.pendingModulePromises.delete(name);
        }
    },

    preloadLikelyModules() {
        runWhenIdle(() => {
            // Warm important modules and worker during idle time.
            import('../../features/Ai.js')
                .then((mod) => { this.moduleConstructors.ai = mod.AiModule; })
                .catch(() => null);
            import('../../features/Backtest.js')
                .then((mod) => { this.moduleConstructors.backtest = mod.BacktestModule; })
                .catch(() => null);

            this.strategyWorker?.warmup?.().catch(() => null);
        });
    },

    bindNav() {
        // Desktop & Mobile Nav
        this.navItems.forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                this.route(target).catch((err) => {
                    console.error('페이지 전환 실패', err);
                    UIManager.toast('페이지 전환 중 오류가 발생했습니다.', 'error');
                });
            });
        });
    },

    async route(target) {
        const perfLabel = `route:${target}`;
        startMark(perfLabel);
        const localToken = ++this.routeToken;
        const changedRoute = this.currentRoute !== target;
        this.currentRoute = target;

        try {
            if (changedRoute) {
                // Active Nav
                this.navItems.forEach((el) => el.classList.remove('active'));
                (this.navByTarget.get(target) || []).forEach((el) => el.classList.add('active'));

                // Active Page
                this.pageItems.forEach((el) => el.classList.remove('active'));
                const page = $(`#page-${target}`);
                if (page) page.classList.add('active');
            }
            const isStale = () => localToken !== this.routeToken;

            if (target !== 'check') {
                try {
                    await this.qr?.stop?.();
                } catch (_e) {
                    // QR scanner cleanup failure should not block navigation.
                }
                if (isStale()) return;
            }

            // Page specific renders
            if (target === 'gen') {
                this.updateLatestWin();
            }
            if (target === 'stats') {
                await this.ensureModule('stats');
                if (isStale()) return;
                this.stats?.render();
            }
            if (target === 'ai') {
                await this.ensureModule('ai');
                if (isStale()) return;
            }
            if (target === 'data') {
                await this.ensureModule('dataIO');
                if (isStale()) return;
                this.renderDataLists();
            }
            if (target === 'check') {
                await this.ensureModule('qr');
                if (isStale()) return;
                await this.ensureModule('check');
                if (isStale()) return;
                this.check?.onEnter();
            }
            if (target === 'bt') {
                await this.ensureModule('backtest');
                if (isStale()) return;
                this.backtest?.onEnter();
            }
        } finally {
            endMark(perfLabel, { changedRoute });
        }
    },

    async refreshCurrentRoute() {
        const t = this.currentRoute;
        const localToken = this.routeToken;
        const isStale = () => localToken !== this.routeToken || t !== this.currentRoute;
        this.renderSettingsPanel();
        if (t === 'gen') this.updateLatestWin();
        if (t === 'stats') {
            await this.ensureModule('stats');
            if (isStale()) return;
            this.stats?.render();
        }
        if (t === 'data') {
            if (isStale()) return;
            this.renderDataLists();
        }
        if (t === 'check') {
            await this.ensureModule('check');
            if (isStale()) return;
            this.check?.onEnter();
        }
        if (t === 'bt') {
            await this.ensureModule('backtest');
            if (isStale()) return;
            this.backtest?.resetUI();
        }
    },

    async requestNumbers(nums) {
        if (!Array.isArray(nums) || nums.length !== 6) return;
        await this.route('gen');
        this.data.state.generated = [nums];
        const list = $('#genResultList');
        if (list) {
            list.innerHTML = '';
            this.generator?.renderResultItem(nums, 0, list);
        }
        UIManager.toast('인공지능 추천 번호로 생성 결과를 교체했습니다.', 'success');
    }
};
