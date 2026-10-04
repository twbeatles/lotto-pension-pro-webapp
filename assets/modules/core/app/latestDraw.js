import { $ } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
import { escapeHtml } from '../../utils/dom.js';

export const appLatestDrawMethods = {
    renderLatestWinPlaceholder({
        badge = '데이터 없음',
        title = '표시할 최신 당첨결과가 없습니다.',
        meta = '데이터 파일을 확인한 뒤 다시 시도하세요.',
        icon = 'ph-database'
    } = {}) {
        const badgeEl = $('#latestDrawNo');
        const ballsEl = $('#latestWinBalls');
        const metaEl = $('#latestWinMeta');
        if (badgeEl) badgeEl.textContent = badge;
        if (ballsEl) {
            const safeIcon = /^ph-[a-z0-9-]+$/i.test(String(icon || '')) ? icon : 'ph-database';
            ballsEl.innerHTML = `
                <div class="latest-win-placeholder">
                    <i class="ph ${safeIcon}"></i>
                    <span>${escapeHtml(title)}</span>
                </div>
            `;
        }
        if (metaEl) {
            metaEl.innerHTML = `<div class="latest-win-placeholder-meta">${escapeHtml(meta)}</div>`;
        }
    },

    updateLatestWin(options = {}) {
        const latest = Array.isArray(this.data.state.winningStats) ? this.data.state.winningStats[0] : null;
        if (!latest) {
            const offline = Boolean(options?.offline);
            this.renderLatestWinPlaceholder({
                badge: offline ? '오프라인' : '데이터 없음',
                title: offline ? '최신 당첨 번호를 불러오지 못했어요.' : '표시할 당첨 번호가 없어요.',
                meta: offline
                    ? '인터넷에 연결되면 새로고침 버튼을 눌러 주세요.'
                    : '새로고침 버튼을 눌러 최신 당첨 번호를 받아오세요.',
                icon: offline ? 'ph-cloud-slash' : 'ph-database'
            });
            return;
        }

        $('#latestDrawNo').textContent = `${latest.draw_no}회`;
        $('#latestWinBalls').innerHTML =
            UIManager.renderBalls(latest.numbers) +
            `<span class="bonus-plus" aria-label="보너스">+</span>` +
            `<span class="ball ${UIManager.getBallColor(latest.bonus)}">${latest.bonus}</span>`;

        // Format Currency
        const fmtMoney = (n) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
        const fmtCount = (n) => new Intl.NumberFormat('ko-KR').format(n);
        const freshness = this.data.getDataFreshness?.() || {};
        const dataSummary =
            typeof this.data.getDataFreshnessSummary === 'function' ? this.data.getDataFreshnessSummary(freshness) : '';
        const freshnessNote = freshness.isPartial
            ? `<span class="badge status-badge is-warn">일부 데이터만 있음</span><span>설정에서 「최신 회차 확인」을 눌러 주세요.</span>`
            : freshness.isStale
              ? `<span class="badge status-badge is-warn">${freshness.behindBy}회차 빠짐</span><span>새로고침 버튼을 눌러 최신 결과를 받아오세요.</span>`
              : '';

        $('#latestWinMeta').innerHTML = `
            <div class="win-meta-stack">
                <span class="win-date">${escapeHtml(latest.date)} 추첨</span>
                ${latest.prize_amount ? `<span class="win-prize">1등 ${fmtCount(latest.winners_count)}명 · 1인당 <strong>${fmtMoney(latest.prize_amount)}</strong></span>` : ''}
                ${freshnessNote ? `<span class="win-freshness">${freshnessNote}</span>` : ''}
                ${freshnessNote && dataSummary ? `<span class="latest-data-summary">${escapeHtml(dataSummary)}</span>` : ''}
            </div>
        `;

        const nextDrawNo =
            typeof this.getSuggestedNextDrawNo === 'function'
                ? this.getSuggestedNextDrawNo()
                : Number(latest.draw_no) + 1;
        ['genTargetDrawNo', 'campStartDraw', 'aiTargetDrawNo'].forEach((id) => {
            if (typeof this.setTargetDrawInputValue === 'function') {
                this.setTargetDrawInputValue(id, nextDrawNo, { force: false, userEdited: false });
                return;
            }
            const el = $(`#${id}`);
            if (!el) return;
            const current = Number(el.value);
            if (!Number.isFinite(current) || current <= 1) el.value = String(nextDrawNo);
        });
    }
};
