import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { StrategyEngine } from '../core/StrategyEngine.js';
import { listStrategies, resolveStrategyId, getStrategyMeta, STRATEGY_CATALOG } from '../core/StrategyCatalog.js';
import { AdvancedMonteCarlo } from '../core/MonteCarlo.js';
import { endMark, startMark } from '../utils/perf.js';

export class AiModule {
    constructor(app) {
        this.app = app;
        this.engine = new StrategyEngine(this.app.data.state.winningStats);
        this.lastRequest = null;
        this.lastExplain = [];
        this.outputDelegationBound = false;

        const btn = $('#aiPredictBtn');
        if (btn) btn.addEventListener('click', () => this.run());

        $('#aiShowExperimental')?.addEventListener('change', () => {
            this.populateStrategySelect();
            this.renderModelGuide();
        });
        $('#aiModelSelect')?.addEventListener('change', () => this.renderModelGuide());

        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
        this.renderModelGuide();
        this.bindOutputDelegation();

        if (this.app.data.state.aiResults && this.app.data.state.aiResults.length > 0) {
            this.renderResults(this.app.data.state.aiResults);
        }
    }

    getAiTargetDrawNo() {
        const latest = Number(this.app.data.state.winningStats?.[0]?.draw_no || 0);
        const input = this.readNumber('aiTargetDrawNo', latest + 1);
        return Math.max(1, Math.floor(input || latest + 1));
    }

    populateStrategySelect() {
        const select = $('#aiModelSelect');
        if (!select) return;
        const previous = select.value || 'ensemble';
        const includeExperimental = Boolean($('#aiShowExperimental')?.checked);
        const strategies = listStrategies({ includeExperimental });
        select.innerHTML = '';

        strategies.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.label} (Tier ${item.tier})${item.experimental ? ' [EXP]' : ''}`;
            select.appendChild(option);
        });

        // Legacy aliases
        const legacy = [
            ['ensemble', 'Legacy: Ensemble'],
            ['statistical', 'Legacy: Statistical'],
            ['balance', 'Legacy: Balance'],
            ['cold', 'Legacy: Cold'],
            ['hot', 'Legacy: Hot']
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
    }

    readNumber(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const raw = String(el.value || '').trim();
        if (!raw) return fallback;
        const n = Number(raw);
        if (!Number.isFinite(n)) return fallback;
        return n;
    }

    range(minId, maxId) {
        const min = this.readNumber(minId, null);
        const max = this.readNumber(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    }

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
    }

    applySavedStrategyPrefs() {
        const saved = this.app.data.state.strategyPrefs?.ai;
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
    }

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
            if (!added) UIManager.toast('Ticket already exists in the ticket book.', 'warning');
            else {
                UIManager.toast(`${targetDrawNo} draw ticket added to ticket book.`, 'success');
                if (this.app.renderDataLists) this.app.renderDataLists();
            }
        });

        this.outputDelegationBound = true;
    }

    appendLog(logEl, message, color = null) {
        if (!logEl) return;
        const line = document.createElement('div');
        if (color) line.style.color = color;
        line.textContent = message;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }

    async run() {
        const btn = $('#aiPredictBtn');
        const out = $('#aiOutput');
        const log = $('#aiLogArea');
        const aiContainer = $('#page-ai .ai-container');

        if (!this.app.data.state.winningStats.length) {
            UIManager.toast('Winning data is missing. (data/winning_stats.json)', 'error', 3000);
            return;
        }

        startMark('ai.run');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Analyzing...';
        out.innerHTML = '';
        log.innerHTML = '';
        aiContainer?.classList.add('fx-active');

        const request = this.buildStrategyRequest();
        this.app.data.save();
        const strategy = request.strategyId;

        const strategyNames = {
            ensemble_weighted: 'Ensemble Weighted',
            stat_ac_sum: 'Statistical AC/Sum',
            balance_oe_hl: 'Odd/Even + High/Low Balance',
            cold_frequency: 'Cold Frequency',
            hot_frequency: 'Hot Frequency'
        };

        const logs = [
            `Selected model: ${strategyNames[strategy] || strategy}`,
            'Analyzing frequency/recency/pattern signals...',
            'Applying strategy weights...',
            `Running Monte Carlo (${request.params.simulationCount.toLocaleString()} samples)...`,
            'Extracting best candidate sets...'
        ];

        try {
            logs.forEach((msg) => this.appendLog(log, `> ${msg}`));

            this.engine = new StrategyEngine(this.app.data.state.winningStats);
            const result = this.engine.recommendFromSimulation(request, { setCount: 5 });
            const results = result.sets;
            if (!results || results.length === 0) throw new Error('Simulation returned empty results');

            const explanations = results.map((set) => this.engine.explainSet(set, request));

            this.appendLog(log, '> Analysis done. Generated 5 recommended sets.', 'var(--success)');
            this.appendLog(log, `> Accepted samples: ${result.simulation.diagnostics.accepted}/${result.simulation.diagnostics.simulationCount}`);

            this.app.data.state.aiResults = results;
            this.lastRequest = request;
            this.lastExplain = explanations;
            this.renderResults(results, explanations);
        } catch (e) {
            console.error('AI Error:', e);
            this.appendLog(log, `> Error: ${e.message}`, 'var(--danger)');
            UIManager.toast('An error occurred during analysis.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph-bold ph-brain"></i> Run Again';
            aiContainer?.classList.remove('fx-active');
            endMark('ai.run', { strategyId: request.strategyId });
        }
    }

    renderResults(results, explanations = []) {
        const out = $('#aiOutput');
        if (!out) return;

        out.innerHTML = '';
        results.forEach((set, idx) => {
            const sum = AdvancedMonteCarlo.calculateSum(set);
            const ac = AdvancedMonteCarlo.calculateAC(set);
            const exp = explanations[idx];

            const row = document.createElement('div');
            row.className = 'ai-card-row';
            row.style.animationDelay = `${idx * 0.1}s`;

            const badgHtml = `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    Sum: ${sum}
                </span>
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    AC: ${ac}
                </span>
            `;

            const ballsHtml = set.map((n) => {
                let colorClass = 'yellow';
                if (n <= 10) colorClass = 'yellow';
                else if (n <= 20) colorClass = 'blue';
                else if (n <= 30) colorClass = 'red';
                else if (n <= 40) colorClass = 'gray';
                else colorClass = 'green';
                return `<span class="ball ${colorClass}">${n}</span>`;
            }).join('');

            row.innerHTML = `
                <div class="ai-card-header" style="justify-content:space-between; display:flex; margin-bottom:8px;">
                     <span class="rank-badge">#${idx + 1}</span>
                     <div class="meta-badges" style="display:flex; gap:4px;">${badgHtml}</div>
                </div>
                <div class="ball-container left">${ballsHtml}</div>
                <div class="row-actions" style="margin-top:8px; display:flex; justify-content:flex-end;">
                     <button class="btn ghost sm pick-btn" data-nums="${set.join(',')}">Pick</button>
                     <button class="btn ghost sm ticket-btn" data-nums="${set.join(',')}">Ticket</button>
                </div>
                ${exp ? `
                <details class="ai-explain" style="margin-top:10px;">
                    <summary style="cursor:pointer; color:var(--text-muted);">Details</summary>
                    <div style="margin-top:8px; font-size:12px; color:var(--text-muted);">
                        <div>Strategy: <b>${exp.strategyId}</b> (Tier ${exp.evidenceTier})</div>
                        <div>Weight: <b>${exp.summary.setWeight}</b>, Filter pass: <b>${exp.filtersPass ? 'YES' : 'NO'}</b></div>
                        <div style="margin-top:6px; display:grid; gap:4px;">
                            ${exp.signals.map((s) => `<div>#${s.number} w:${s.weight} / f:${s.frequencyScore} / r:${s.recencyScore} / g:${s.gapScore} / p:${s.pairScore}</div>`).join('')}
                        </div>
                    </div>
                </details>` : ''}
            `;

            out.appendChild(row);
        });
    }

    renderModelGuide() {
        const container = $('#aiModelGuideContainer');
        if (!container) return;

        const selectedId = resolveStrategyId($('#aiModelSelect')?.value || 'ensemble_weighted');
        const selectedMeta = getStrategyMeta(selectedId);
        const includeExperimental = Boolean($('#aiShowExperimental')?.checked);
        const allStrategies = Object.values(STRATEGY_CATALOG).filter((s) => includeExperimental || !s.experimental);

        const tierIcons = { A: 'A', B: 'B', C: 'C' };
        const tierLabels = { A: 'Validated', B: 'Usable', C: 'Experimental' };
        const tierColors = { A: 'var(--success)', B: 'var(--primary)', C: 'var(--warning)' };

        const selectedCard = `
            <div class="guide-selected">
                <div class="guide-selected-header">
                    <h3><i class="ph-bold ph-book-open"></i> Current Model</h3>
                    <span class="guide-tier-badge" style="border-color: ${tierColors[selectedMeta.tier]}; color: ${tierColors[selectedMeta.tier]};">
                        ${tierIcons[selectedMeta.tier]} Tier ${selectedMeta.tier} - ${tierLabels[selectedMeta.tier]}
                    </span>
                </div>
                <div class="guide-selected-body">
                    <h4>${selectedMeta.label}</h4>
                    <p class="guide-desc">${selectedMeta.description || selectedMeta.summary}</p>
                    ${selectedMeta.experimental ? '<div class="guide-warning"><i class="ph-bold ph-warning"></i> This is an experimental model. Validate with backtesting before use.</div>' : ''}
                    ${this._renderDefaultFilters(selectedMeta)}
                </div>
            </div>
        `;

        const gridItems = allStrategies.map((s) => {
            const isActive = s.id === selectedId;
            return `
                <div class="guide-item ${isActive ? 'active' : ''}" data-strategy-id="${s.id}">
                    <div class="guide-item-head">
                        <span class="guide-item-tier" style="color: ${tierColors[s.tier]};">${tierIcons[s.tier]}</span>
                        <strong>${s.label}</strong>
                        ${s.experimental ? '<span class="guide-exp-tag">EXP</span>' : ''}
                    </div>
                    <p>${s.summary}</p>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            ${selectedCard}
            <div class="guide-all-header">
                <h3><i class="ph-bold ph-list-bullets"></i> Strategy Overview</h3>
                <span class="guide-count">${allStrategies.length} strategies</span>
            </div>
            <div class="guide-grid">${gridItems}</div>
            <div class="guide-filter-notice">
                <i class="ph-bold ph-info"></i>
                <span>If filters are too strict, valid combinations may be rare and fallback random generation can increase.</span>
            </div>
        `;

        container.querySelectorAll('.guide-item').forEach((item) => {
            item.addEventListener('click', () => {
                const stratId = item.dataset.strategyId;
                const select = $('#aiModelSelect');
                if (select && [...select.options].some((o) => o.value === stratId)) {
                    select.value = stratId;
                    this.renderModelGuide();
                }
            });
        });
    }

    _renderDefaultFilters(meta) {
        const filters = meta.defaultFilters || {};
        const parts = [];
        if (filters.oddEven) parts.push(`Odd ${filters.oddEven[0]}-${filters.oddEven[1]}`);
        if (filters.highLow) parts.push(`High ${filters.highLow[0]}-${filters.highLow[1]}`);
        if (filters.sumRange) parts.push(`Sum ${filters.sumRange[0]}-${filters.sumRange[1]}`);
        if (filters.acRange) parts.push(`AC ${filters.acRange[0]}-${filters.acRange[1]}`);
        if (filters.maxConsecutivePairs != null) parts.push(`Consecutive <= ${filters.maxConsecutivePairs}`);
        if (filters.endDigitUniqueMin != null) parts.push(`End-digit unique >= ${filters.endDigitUniqueMin}`);
        if (!parts.length) return '';
        return `<div class="guide-default-filters"><strong>Default filters:</strong> ${parts.join(' / ')}</div>`;
    }
}

