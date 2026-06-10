import { $ } from '../../utils/utils.js';
import { Pension720Engine } from '../../core/Pension720Engine.js';
import { UIManager } from '../../core/UIManager.js';
import { appendDigitBalls, clearElement, formatDate, makeEl } from './dom.js';

export const pension720StatsMethods = {
    async onEnter() {
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        this.resetCampaignOptions(false);
        this.render();
    },

    render() {
        this.renderStatus();
        this.renderStats();
        this.renderSavedTickets();
        this.renderCampaigns();
        this.renderCheckPlaceholder();
        if (this.lastRecommendations.length) {
            this.renderRecommendations(this.lastRecommendations);
        }
    },

    renderStatus() {
        const health = this.data.mergePension720DataHealth(
            this.data.pension720DataHealth || this.data.getDefaultPension720DataHealth()
        );
        const latest = this.data.state.pension720Stats?.[0] || null;
        const statusEl = $('#pension720DataStatus');
        const latestDrawEl = $('#pension720LatestDraw');
        const latestNumberEl = $('#pension720LatestNumber');
        const latestBonusEl = $('#pension720LatestBonus');

        if (statusEl) {
            statusEl.textContent =
                health.availability === 'full' ? health.message : '연금복권 데이터를 불러와야 합니다.';
            statusEl.className = `badge status-badge ${health.availability === 'full' ? 'is-good' : 'is-bad'}`;
        }
        if (latestDrawEl) {
            latestDrawEl.textContent = latest ? `${latest.draw_no}회 · ${formatDate(latest.date)}` : '-';
        }
        if (latestNumberEl) {
            latestNumberEl.replaceChildren();
            if (latest) appendDigitBalls(latestNumberEl, latest.number, { group: latest.group });
            else latestNumberEl.textContent = '-';
        }
        if (latestBonusEl) {
            latestBonusEl.replaceChildren();
            if (latest) appendDigitBalls(latestBonusEl, latest.bonus_number);
            else latestBonusEl.textContent = '-';
        }
    },

    renderStats() {
        const stats = this.data.state.pension720Stats || [];
        const groupContainer = $('#pension720GroupStats');
        const digitContainer = $('#pension720DigitStats');
        const recentContainer = $('#pension720RecentSummary');
        clearElement(groupContainer);
        clearElement(digitContainer);
        clearElement(recentContainer);

        if (!stats.length) {
            groupContainer?.appendChild(makeEl('p', 'empty-state', '연금복권 데이터를 불러온 뒤 통계를 표시합니다.'));
            return;
        }

        const engine = new Pension720Engine(stats);
        const summary = engine.getSummary();
        const maxGroupScore = Math.max(...summary.topGroups.map((item) => item.score), 1);
        summary.topGroups
            .slice()
            .sort((a, b) => a.group - b.group)
            .forEach((item) => {
                const row = makeEl('div', 'p720-stat-row');
                row.appendChild(makeEl('span', 'p720-stat-label', `${item.group}조`));
                const track = makeEl('span', 'p720-stat-track');
                const fill = makeEl('span', 'p720-stat-fill');
                fill.style.width = `${Math.max(4, (item.score / maxGroupScore) * 100).toFixed(1)}%`;
                track.appendChild(fill);
                row.appendChild(track);
                row.appendChild(makeEl('span', 'p720-stat-value', `${item.rawCount || item.count || 0}회`));
                groupContainer?.appendChild(row);
            });

        engine.analysis.positionStats.forEach((weights, pos) => {
            const topDigits = weights
                .map((weight, digit) => ({ digit, weight }))
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 3);
            const item = makeEl('div', 'p720-digit-position');
            item.appendChild(makeEl('span', 'p720-stat-label', `${pos + 1}번째`));
            const balls = makeEl('div', 'p720-digit-balls');
            topDigits.forEach(({ digit }) => balls.appendChild(makeEl('span', 'p720-ball sm', String(digit))));
            item.appendChild(balls);
            digitContainer?.appendChild(item);
        });

        const recent = stats.slice(0, 8);
        recent.forEach((draw) => {
            const item = makeEl('div', 'p720-recent-item');
            item.appendChild(makeEl('span', 'p720-recent-draw', `${draw.draw_no}회`));
            appendDigitBalls(item, draw.number, { group: draw.group });
            recentContainer?.appendChild(item);
        });
    },

    async refreshData() {
        const btn = $('#pension720RefreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '새로고침 중';
        }
        try {
            const ok = await this.data.fetchPension720Stats({ remote: true, preserveExistingOnFailure: true });
            this.render();
            UIManager.toast(
                ok ? '연금복권 데이터를 새로고침했습니다.' : '연금복권 데이터를 확인하지 못했습니다.',
                ok ? 'success' : 'warning'
            );
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '최신 데이터 확인';
            }
        }
    }
};
