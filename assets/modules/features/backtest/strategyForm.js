import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { UI_STRINGS } from '../../utils/strings.js';
import { listStrategies, resolveStrategyId } from '../../core/StrategyCatalog.js';

export const backtestStrategyFormMethods = {
    readPayoutMode() {
        const mode = String($('#btPayoutMode')?.value || 'hybrid_dynamic_first');
        return mode === 'fast_fixed' ? 'fast_fixed' : 'hybrid_dynamic_first';
    },

    populateStrategySelect() {
        const select = $('#btStrategy');
        const compareList = $('#btCompareList');
        if (!select) return;

        const current = select.value || 'random';
        const includeExperimental = Boolean($('#btShowExperimental')?.checked);
        const strategies = listStrategies({ includeExperimental, scope: 'backtest' });
        select.innerHTML = '';

        strategies.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.label} (등급 ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(opt);
        });

        const legacy = [
            ['random', '레거시 모델: 랜덤'],
            ['ensemble', '레거시 모델: 앙상블'],
            ['balance', '레거시 모델: 밸런스'],
            ['cold', '레거시 모델: 콜드'],
            ['hot', '레거시 모델: 핫'],
            ['statistical', '레거시 모델: 통계']
        ];
        legacy.forEach(([id, label]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = label;
            select.appendChild(opt);
        });

        const resolved = resolveStrategyId(current);
        if ([...select.options].some((x) => x.value === current)) select.value = current;
        else if ([...select.options].some((x) => x.value === resolved)) select.value = resolved;

        if (compareList) {
            compareList.innerHTML = '';
            strategies.forEach((item) => {
                const label = document.createElement('label');
                label.className = 'check-box';
                label.innerHTML = `
                    <input type="checkbox" name="btCompareStrategy" value="${item.id}">
                    <span class="checkmark"></span>
                    <span>${item.label}</span>
                `;
                compareList.appendChild(label);
            });
        }

        this.toggleCompareMode();
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

    range(minId, maxId) {
        const min = this.readNumber(minId, null);
        const max = this.readNumber(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    },

    buildStrategyRequest(strategyIdOverride = null, persist = true) {
        const strategyId = resolveStrategyId(strategyIdOverride || $('#btStrategy')?.value || 'random_baseline');
        const request = {
            strategyId,
            params: {
                simulationCount: this.readNumber('btSimulationCount', 5000),
                lookbackWindow: this.readNumber('btLookbackWindow', 20),
                wheelPoolSize: null,
                wheelGuarantee: null,
                seed: this.readNumber('btSeed', null),
                payoutMode: this.readPayoutMode()
            },
            filters: {
                oddEven: this.range('btOddMin', 'btOddMax'),
                highLow: this.range('btHighMin', 'btHighMax'),
                sumRange: this.range('btSumMin', 'btSumMax'),
                acRange: this.range('btAcMin', 'btAcMax'),
                maxConsecutivePairs: this.readNumber('btMaxConsecutive', null),
                endDigitUniqueMin: this.readNumber('btEndDigitUnique', null)
            }
        };
        if (persist) this.data.setStrategyPrefs('backtest', request);
        return request;
    },

    collectStrategyRequests() {
        const compareMode = Boolean($('#btCompareMode')?.checked);
        const primary = this.buildStrategyRequest(null, true);
        if (!compareMode) return [primary];

        const checked = [...document.querySelectorAll('input[name="btCompareStrategy"]:checked')]
            .map((el) => resolveStrategyId(el.value))
            .filter(Boolean);

        const unique = new Set([primary.strategyId, ...checked]);
        const ids = [...unique].slice(0, this.MAX_COMPARE_STRATEGIES);
        return ids.map((id, idx) => this.buildStrategyRequest(id, idx === 0));
    },

    applyStrategyRequest(saved) {
        if (!saved) return;
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el && value !== undefined && value !== null) el.value = value;
        };
        assign('btSimulationCount', saved.params?.simulationCount);
        assign('btLookbackWindow', saved.params?.lookbackWindow);
        assign('btSeed', saved.params?.seed ?? '');
        assign('btPayoutMode', saved.params?.payoutMode || 'hybrid_dynamic_first');
        this.currentPayoutMode = this.readPayoutMode();

        const pair = (minId, maxId, values) => {
            const minEl = $(`#${minId}`);
            const maxEl = $(`#${maxId}`);
            if (!minEl || !maxEl) return;
            if (Array.isArray(values) && values.length >= 2) {
                minEl.value = values[0];
                maxEl.value = values[1];
            }
        };
        pair('btOddMin', 'btOddMax', saved.filters?.oddEven);
        pair('btHighMin', 'btHighMax', saved.filters?.highLow);
        pair('btSumMin', 'btSumMax', saved.filters?.sumRange);
        pair('btAcMin', 'btAcMax', saved.filters?.acRange);
        assign('btMaxConsecutive', saved.filters?.maxConsecutivePairs);
        assign('btEndDigitUnique', saved.filters?.endDigitUniqueMin);

        const strategyId = resolveStrategyId(saved.strategyId || 'random_baseline');
        const select = $('#btStrategy');
        if (select && [...select.options].some((x) => x.value === strategyId)) {
            select.value = strategyId;
        }
    },

    applySavedStrategyPrefs() {
        this.applyStrategyRequest(this.data.state.strategyPrefs?.backtest);
    },

    exportComparisonCsv() {
        if (!this.lastComparisons.length) {
            UIManager.toast(UI_STRINGS.backtest.emptyExport, 'warning');
            return;
        }

        const header = [
            'strategy_id',
            'strategy_label',
            'roi',
            'hit_rate',
            'draws',
            'tickets',
            'total_cost',
            'total_prize',
            'win_count'
        ];
        const lines = [header.join(',')];
        this.lastComparisons.forEach((x) => {
            lines.push(
                [
                    x.strategyId || '',
                    this.getStrategyLabel(x.strategyId),
                    Number(x.roi || 0).toFixed(4),
                    Number(x.hitRate || 0).toFixed(4),
                    Number(x.draws || 0),
                    Number(x.tickets || 0),
                    Number(x.cost || 0),
                    Number(x.totalPrize || 0),
                    Number(x.winCount || 0)
                ].join(',')
            );
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `시뮬레이션_전략비교_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast(UI_STRINGS.backtest.exported, 'success');
    }
};
