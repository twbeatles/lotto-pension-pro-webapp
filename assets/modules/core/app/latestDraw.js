import { $ } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
                title: offline ? '최신 당첨결과를 불러오지 못했습니다.' : '표시할 최신 당첨결과가 없습니다.',
                meta: offline
                    ? '오프라인 상태입니다. 연결 후 다시 동기화하세요.'
                    : '당첨 데이터 파일을 확인한 뒤 다시 시도하세요.',
                icon: offline ? 'ph-cloud-slash' : 'ph-database'
            });
            return;
        }

        $('#latestDrawNo').textContent = `${latest.draw_no}회`;
        $('#latestWinBalls').innerHTML =
            UIManager.renderBalls(latest.numbers) +
            `<span style="margin:0 8px; color:var(--text-muted); font-weight:bold; font-size:1.2em;">+</span>` +
            `<span class="ball ${UIManager.getBallColor(latest.bonus)}">${latest.bonus}</span>`;

        // Format Currency
        const fmtMoney = (n) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
        const fmtCount = (n) => new Intl.NumberFormat('ko-KR').format(n);
        const freshness = this.data.getDataFreshness?.() || {};
        const freshnessNote = freshness.isPartial
            ? `<span class="badge status-badge is-warn">부분 복구</span><span>최근 일부 회차만 사용할 수 있습니다.</span>`
            : freshness.isStale
              ? `<span class="badge status-badge is-warn">${freshness.behindBy}회차 지연</span><span>최신 회차와 차이가 있을 수 있습니다.</span>`
              : '';

        $('#latestWinMeta').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                <span>${escapeHtml(latest.date)} 추첨</span>
                ${latest.prize_amount ? `<span class="badge" style="font-size:0.85em; background:rgba(255,255,255,0.1)">1등 ${fmtCount(latest.winners_count)}명 (${fmtMoney(latest.prize_amount)})</span>` : ''}
                ${freshnessNote ? `<span style="display:flex; gap:8px; align-items:center; justify-content:center; flex-wrap:wrap;">${freshnessNote}</span>` : ''}
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
