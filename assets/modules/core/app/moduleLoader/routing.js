import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../UIManager.js';
import { endMark, startMark } from '../../../utils/perf.js';

export const appModuleLoaderRoutingMethods = {
    bindNav() {
        this.navItems.forEach((el) => {
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
                this.navItems.forEach((el) => el.classList.remove('active'));
                (this.navByTarget.get(target) || []).forEach((el) => el.classList.add('active'));

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
    }
};
