import { $ } from '../../../utils/utils.js';

export const appModuleLoaderDataHealthMethods = {
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
            ai: '통계 추천',
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
    }
};
