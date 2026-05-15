import { runWhenIdle } from '../../../utils/loader.js';

export const appModuleLoaderRegistryMethods = {
    cacheStaticSelectors() {
        this.navItems = Array.from(document.querySelectorAll('.nav-item'));
        this.pageItems = Array.from(document.querySelectorAll('.page'));
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
                    const mod = await import('../../../features/Stats.js');
                    this.moduleConstructors[name] = mod.StatsModule;
                } else if (name === 'ai') {
                    const mod = await import('../../../features/Ai.js');
                    this.moduleConstructors[name] = mod.AiModule;
                } else if (name === 'check') {
                    const mod = await import('../../../features/Check.js');
                    this.moduleConstructors[name] = mod.CheckModule;
                } else if (name === 'dataIO') {
                    const mod = await import('../../../features/DataIO.js');
                    this.moduleConstructors[name] = mod.DataIOModule;
                } else if (name === 'backtest') {
                    const mod = await import('../../../features/Backtest.js');
                    this.moduleConstructors[name] = mod.BacktestModule;
                } else if (name === 'pension720') {
                    const mod = await import('../../../features/Pension720.js');
                    this.moduleConstructors[name] = mod.Pension720Module;
                } else if (name === 'qr') {
                    const mod = await import('../../../features/QrScanner.js');
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
        const connection =
            typeof navigator !== 'undefined'
                ? navigator.connection || navigator.mozConnection || navigator.webkitConnection
                : null;
        const constrainedNetwork =
            Boolean(connection?.saveData) || ['2g', 'slow-2g'].includes(String(connection?.effectiveType || ''));
        if (constrainedNetwork) return;

        const schedule = (task, delayMs) => {
            setTimeout(() => runWhenIdle(task, 1200), Math.max(0, Number(delayMs) || 0));
        };
        schedule(() => {
            import('../../../features/Pension720.js')
                .then((mod) => {
                    this.moduleConstructors.pension720 = mod.Pension720Module;
                })
                .catch(() => null);
        }, 1000);
        schedule(() => {
            import('../../../features/Ai.js')
                .then((mod) => {
                    this.moduleConstructors.ai = mod.AiModule;
                })
                .catch(() => null);
        }, 1800);
        schedule(() => {
            import('../../../features/Backtest.js')
                .then((mod) => {
                    this.moduleConstructors.backtest = mod.BacktestModule;
                })
                .catch(() => null);
        }, 2600);
        schedule(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            this.strategyWorker?.warmup?.().catch(() => null);
        }, 3200);
    }
};
