import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';

export const aiFormDelegationMethods = {
    bindOutputDelegation() {
        if (this.outputDelegationBound) return;
        const out = $('#aiOutput');
        if (!out) return;

        out.addEventListener('click', (e) => {
            const pickBtn = e.target.closest('.pick-btn');
            if (pickBtn) {
                const nums = String(pickBtn.dataset.nums || '')
                    .split(',')
                    .map(Number)
                    .filter(Number.isFinite);
                if (nums.length === 6) {
                    this.app.requestNumbers(nums, {
                        strategyRequest: this.lastRequest || this.buildStrategyRequest(),
                        source: 'ai'
                    });
                }
                return;
            }

            const ticketBtn = e.target.closest('.ticket-btn');
            if (!ticketBtn) return;
            const nums = String(ticketBtn.dataset.nums || '')
                .split(',')
                .map(Number)
                .filter(Number.isFinite);
            if (nums.length !== 6) return;

            const targetDrawNo = this.getAiTargetDrawNo();
            const result = this.app.data.addTicket(nums, {
                source: 'ai',
                targetDrawNo,
                strategyRequest: this.lastRequest || this.buildStrategyRequest()
            });
            if (!result?.ticket) UIManager.toast('내 번호 보관함 추가에 실패했습니다.', 'error');
            else {
                UIManager.toast(
                    result.incremented
                        ? `${targetDrawNo}회차 동일 티켓 수량을 x${result.quantity}로 늘렸습니다.`
                        : `${targetDrawNo}회차 내 번호 보관함에 추가했습니다.`,
                    'success'
                );
                if (this.app.renderDataLists) this.app.renderDataLists();
            }
        });

        this.outputDelegationBound = true;
    },

    appendLog(logEl, message, color = null) {
        if (!logEl) return;
        const line = document.createElement('div');
        if (color) line.style.color = color;
        line.textContent = message;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }
};