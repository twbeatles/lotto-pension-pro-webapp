import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { UI_STRINGS } from '../../../utils/strings.js';

export const checkResultCoreMethods = {
    resetResult() {
        const area = $('#checkResultArea');
        if (!area) return;
        this.currentTicket = null;
        this.currentDrawNo = null;
        area.setAttribute('aria-busy', 'false');
        area.classList.add('check-result-placeholder');
        area.innerHTML = `
      <i class="ph ph-magnifying-glass" style="font-size: 48px; color: var(--muted);"></i>
      <p>${UI_STRINGS.check.selectionHint}</p>
    `;
    },

    renderTicketBalls(nums, winSet) {
        return nums
            .map((n) => {
                const hit = winSet.has(n) ? 'hit' : '';
                return `<span class="ball ${UIManager.getBallColor(n)} sm ${hit}" role="img" aria-label="${n}번 번호">${n}</span>`;
            })
            .join('');
    },

    run() {
        if (!this.data.state.winningStats.length) {
            return UIManager.toast('당첨 데이터가 없습니다. 데이터 파일을 확인해주세요.', 'error', 3000);
        }

        this.data.warnIfDataStale?.('번호 확인');

        const selected = this.getSelectedEntry();
        if (!selected) return UIManager.toast(UI_STRINGS.check.emptySelection, 'warning');

        const ticket = selected.item;
        if (!ticket) return UIManager.toast('선택 항목을 찾을 수 없습니다.', 'error');

        const area = $('#checkResultArea');
        area?.setAttribute('aria-busy', 'true');
        try {
            if (this.mode === 'all') return this.runAll(ticket);
            return this.runLatest(ticket);
        } finally {
            area?.setAttribute('aria-busy', 'false');
        }
    },

    _rank(matchCount, bonusHit) {
        if (matchCount === 6) return 1;
        if (matchCount === 5 && bonusHit) return 2;
        if (matchCount === 5) return 3;
        if (matchCount === 4) return 4;
        if (matchCount === 3) return 5;
        return 0;
    }
};