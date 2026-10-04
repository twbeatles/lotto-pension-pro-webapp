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
            if (!result?.ticket) UIManager.toast('구매 번호로 저장하지 못했어요.', 'error');
            else {
                UIManager.toast(
                    result.incremented
                        ? `${targetDrawNo}회차에 같은 번호가 있어 수량을 ${result.quantity}장으로 늘렸어요.`
                        : `${targetDrawNo}회차 구매 번호로 저장했어요. 추첨 후 「당첨 확인」에서 결과를 볼 수 있어요.`,
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