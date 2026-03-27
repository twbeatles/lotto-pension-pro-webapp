import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { listStrategies, resolveStrategyId } from '../../core/StrategyCatalog.js';
export const aiFormMethods = {
    getAiTargetDrawNo() {
        const latest = Number(this.app.data.state.winningStats?.[0]?.draw_no || 0);
        const input = this.readNumber('aiTargetDrawNo', latest + 1);
        return Math.max(1, Math.floor(input || latest + 1));
    },

    populateStrategySelect() {
        const select = $('#aiModelSelect');
        if (!select) return;
        const previous = select.value || 'ensemble';
        const includeExperimental = Boolean($('#aiShowExperimental')?.checked);
        const strategies = listStrategies({ includeExperimental, scope: 'ai' });
        select.innerHTML = '';

        strategies.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.label} (등급 ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(option);
        });

        // Legacy aliases
        const legacy = [
            ['ensemble', '레거시 모델: 앙상블'],
            ['statistical', '레거시 모델: 통계'],
            ['balance', '레거시 모델: 밸런스'],
            ['cold', '레거시 모델: 콜드'],
            ['hot', '레거시 모델: 핫']
        ];
        legacy.forEach(([id, label]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = label;
            select.appendChild(option);
        });

        const resolved = resolveStrategyId(previous);
        if ([...select.options].some((x) => x.value === previous)) {
            select.value = previous;
        } else if ([...select.options].some((x) => x.value === resolved)) {
            select.value = resolved;
        }
    },

    readNumber(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const raw = String(el.value || '').trim();
        if (!raw) return fallback;
        const n = Number(raw);
        if (!Number.isFinite(n)) return fallback;
        return n;
    },

    isWorkerTimeoutError(err) {
        return String(err?.message || '').includes('WORKER_TIMEOUT');
    },

    range(minId, maxId) {
        const min = this.readNumber(minId, null);
        const max = this.readNumber(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    },

    buildStrategyRequest() {
        const request = {
            strategyId: resolveStrategyId($('#aiModelSelect')?.value || 'ensemble_weighted'),
            params: {
                simulationCount: this.readNumber('aiSimulationCount', 5000),
                lookbackWindow: this.readNumber('aiLookbackWindow', 20),
                wheelPoolSize: null,
                wheelGuarantee: null,
                seed: this.readNumber('aiSeed', null)
            },
            filters: {
                oddEven: this.range('aiOddMin', 'aiOddMax'),
                highLow: this.range('aiHighMin', 'aiHighMax'),
                sumRange: this.range('aiSumMin', 'aiSumMax'),
                acRange: this.range('aiAcMin', 'aiAcMax'),
                maxConsecutivePairs: this.readNumber('aiMaxConsecutive', null),
                endDigitUniqueMin: this.readNumber('aiEndDigitUnique', null)
            }
        };
        this.app.data.setStrategyPrefs('ai', request);
        return request;
    },

    applyStrategyRequest(saved) {
        if (!saved) return;
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el && value !== undefined && value !== null) el.value = value;
        };
        assign('aiSimulationCount', saved.params?.simulationCount);
        assign('aiLookbackWindow', saved.params?.lookbackWindow);
        assign('aiSeed', saved.params?.seed ?? '');

        const pair = (minId, maxId, values) => {
            const minEl = $(`#${minId}`);
            const maxEl = $(`#${maxId}`);
            if (!minEl || !maxEl) return;
            if (Array.isArray(values) && values.length >= 2) {
                minEl.value = values[0];
                maxEl.value = values[1];
            }
        };

        pair('aiOddMin', 'aiOddMax', saved.filters?.oddEven);
        pair('aiHighMin', 'aiHighMax', saved.filters?.highLow);
        pair('aiSumMin', 'aiSumMax', saved.filters?.sumRange);
        pair('aiAcMin', 'aiAcMax', saved.filters?.acRange);
        assign('aiMaxConsecutive', saved.filters?.maxConsecutivePairs);
        assign('aiEndDigitUnique', saved.filters?.endDigitUniqueMin);

        const strategyId = resolveStrategyId(saved.strategyId || 'ensemble_weighted');
        const select = $('#aiModelSelect');
        if (select && [...select.options].some((x) => x.value === strategyId)) {
            select.value = strategyId;
        }
        this.renderModelGuide();
    },

    applySavedStrategyPrefs() {
        this.applyStrategyRequest(this.app.data.state.strategyPrefs?.ai);
    },

    bindOutputDelegation() {
        if (this.outputDelegationBound) return;
        const out = $('#aiOutput');
        if (!out) return;

        out.addEventListener('click', (e) => {
            const pickBtn = e.target.closest('.pick-btn');
            if (pickBtn) {
                const nums = String(pickBtn.dataset.nums || '').split(',').map(Number).filter(Number.isFinite);
                if (nums.length === 6) this.app.requestNumbers(nums);
                return;
            }

            const ticketBtn = e.target.closest('.ticket-btn');
            if (!ticketBtn) return;
            const nums = String(ticketBtn.dataset.nums || '').split(',').map(Number).filter(Number.isFinite);
            if (nums.length !== 6) return;

            const targetDrawNo = this.getAiTargetDrawNo();
            const added = this.app.data.addTicket(nums, {
                source: 'ai',
                targetDrawNo,
                strategyRequest: this.lastRequest || this.buildStrategyRequest()
            });
            if (!added) UIManager.toast('이미 티켓북에 있는 번호입니다.', 'warning');
            else {
                UIManager.toast(`${targetDrawNo}회차 티켓을 티켓북에 추가했습니다.`, 'success');
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
