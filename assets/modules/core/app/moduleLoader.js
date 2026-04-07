import { $, $$ } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
import { runWhenIdle } from '../../utils/loader.js';
import { endMark, startMark } from '../../utils/perf.js';
export const appModuleLoaderMethods = {
    bindDataHealthActions() {
        if (this.dataHealthActionsBound || typeof document === 'undefined') return;
        document.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-data-health-action]');
            if (!button) return;
            const action = button.dataset.dataHealthAction;
            if (action === 'sync') {
                await this.data.fetchLatestFromAPI({ silent: false, trigger: 'manual' });
                return;
            }
            if (action === 'data') {
                await this.route('data');
            }
        });
        this.dataHealthActionsBound = true;
    },

    routeRequiresFullData(target) {
        return ['stats', 'ai', 'bt'].includes(String(target || '').trim());
    },

    getRouteDataHealthCopy(target) {
        const freshness = this.data.getDataFreshness();
        const featureLabels = {
            stats: '당첨 통계',
            ai: '인공지능 예측',
            bt: '시뮬레이션',
            gen: '번호 생성',
            check: '번호 확인'
        };
        const featureLabel = featureLabels[target] || '이 기능';
        if (freshness.isUnavailable) {
            return {
                title: `${featureLabel}에 필요한 데이터가 없습니다.`,
                body: freshness.dataHealthMessage || '당첨 데이터를 불러오지 못했습니다. 동기화 후 다시 시도해주세요.'
            };
        }
        if (freshness.isPartial) {
            return {
                title: `${featureLabel}은 전체 데이터 복구 후 사용할 수 있습니다.`,
                body: freshness.dataHealthMessage || '현재는 최근 일부 회차만 확보된 부분 복구 상태입니다.'
            };
        }
        return {
            title: `${featureLabel}을 사용할 수 있습니다.`,
            body: ''
        };
    },

    clearRouteDataGate(target) {
        const page = $(`#page-${target}`);
        if (!page) return;
        page.classList.remove('route-data-gated');
        page.querySelector('.data-health-gate')?.remove();
    },

    renderRouteDataGate(target) {
        const page = $(`#page-${target}`);
        if (!page) return false;
        const hasLoadSignal = Boolean(this.data.lastWinningStatsLoad?.updatedAt) || Boolean(this.data.state.winningStats?.length);
        if (!hasLoadSignal) {
            this.clearRouteDataGate(target);
            return false;
        }
        const freshness = this.data.getDataFreshness();
        if (!this.routeRequiresFullData(target) || freshness.availability === 'full') {
            this.clearRouteDataGate(target);
            return false;
        }

        const { title, body } = this.getRouteDataHealthCopy(target);
        let gate = page.querySelector('.data-health-gate');
        if (!gate) {
            gate = document.createElement('section');
            gate.className = 'card glass data-health-gate';
            page.querySelector('.page-header')?.insertAdjacentElement('afterend', gate);
        }

        gate.innerHTML = `
            <div class="data-health-gate-head">
                <span class="badge status-badge is-bad">${freshness.isPartial ? '부분 복구' : '데이터 없음'}</span>
                <strong>${title}</strong>
            </div>
            <p class="subtitle">${body}</p>
            <div class="button-group">
                <button class="btn primary" type="button" data-data-health-action="sync">
                    <i class="ph-bold ph-arrows-clockwise"></i> 다시 동기화
                </button>
                <button class="btn ghost" type="button" data-data-health-action="data">
                    <i class="ph ph-database"></i> 데이터 관리로 이동
                </button>
            </div>
        `;
        page.classList.add('route-data-gated');
        return true;
    },

    syncRouteDataNotice(target) {
        const page = $(`#page-${target}`);
        if (!page) return;
        const hasLoadSignal = Boolean(this.data.lastWinningStatsLoad?.updatedAt) || Boolean(this.data.state.winningStats?.length);
        if (!hasLoadSignal) {
            page.querySelector('.data-health-banner')?.remove();
            return;
        }
        const freshness = this.data.getDataFreshness();
        let banner = page.querySelector('.data-health-banner');

        if (!['gen', 'check'].includes(target) || freshness.availability === 'full') {
            banner?.remove();
            return;
        }

        const { body } = this.getRouteDataHealthCopy(target);
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'data-health-banner';
            page.querySelector('.page-header')?.insertAdjacentElement('afterend', banner);
        }

        banner.innerHTML = `
            <span class="badge status-badge ${freshness.isPartial ? 'is-warn' : 'is-bad'}">${freshness.isPartial ? '부분 복구' : '데이터 없음'}</span>
            <span>${body}</span>
            <button class="btn ghost sm" type="button" data-data-health-action="sync">재동기화</button>
        `;
    },

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
            this.syncMobileMoreButtonState?.(target);
            const isStale = () => localToken !== this.routeToken;
            this.syncRouteDataNotice('gen');
            this.syncRouteDataNotice('check');

            if (target !== 'check') {
                try {
                    await this.qr?.stop?.();
                } catch (_e) {
                    // QR scanner cleanup failure should not block navigation.
                }
                if (isStale()) return;
            }

            if (this.renderRouteDataGate(target)) return;

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
        this.syncRouteDataNotice('gen');
        this.syncRouteDataNotice('check');
        if (this.renderRouteDataGate(t)) return;
        if (t === 'gen') this.updateLatestWin();
        if (t === 'stats') {
            await this.ensureModule('stats');
            if (isStale()) return;
            this.stats?.render();
        }
        if (t === 'ai') {
            await this.ensureModule('ai');
            if (isStale()) return;
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
            this.backtest?.onEnter();
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
