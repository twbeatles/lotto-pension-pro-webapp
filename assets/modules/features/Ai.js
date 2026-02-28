import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { StrategyEngine } from '../core/StrategyEngine.js';
import { listStrategies, resolveStrategyId, getStrategyMeta, STRATEGY_CATALOG } from '../core/StrategyCatalog.js';
import { AdvancedMonteCarlo } from '../core/MonteCarlo.js';
import { endMark, startMark } from '../utils/perf.js';
import { StrategyWorkerClient } from '../core/StrategyWorkerClient.js';

export class AiModule {
    constructor(app) {
        this.app = app;
        this.engine = new StrategyEngine(this.app.data.state.winningStats);
        this.workerClient = this.app.strategyWorker || new StrategyWorkerClient();
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
            option.textContent = `${item.label} (?깃툒 ${item.tier})${item.experimental ? ' [?ㅽ뿕]' : ''}`;
            select.appendChild(option);
        });

        // Legacy aliases
        const legacy = [
            ['ensemble', '?댁쟾 紐⑤뜽: ?숈긽釉?],
            ['statistical', '?댁쟾 紐⑤뜽: ?듦퀎'],
            ['balance', '?댁쟾 紐⑤뜽: 洹좏삎'],
            ['cold', '?댁쟾 紐⑤뜽: ?鍮덈룄'],
            ['hot', '?댁쟾 紐⑤뜽: 怨좊퉰??]
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

    isWorkerTimeoutError(err) {
        return String(err?.message || '').includes('WORKER_TIMEOUT');
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
            if (!added) UIManager.toast('?대? ?곗폆遺곸뿉 ?덈뒗 踰덊샇?낅땲??', 'warning');
            else {
                UIManager.toast(`${targetDrawNo}?뚯감 ?곗폆???곗폆遺곸뿉 異붽??섏뿀?듬땲??`, 'success');
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
            UIManager.toast('?뱀꺼 ?곗씠?곌? ?놁뒿?덈떎. ?곗씠???뚯씪???뺤씤?댁＜?몄슂.', 'error', 3000);
            return;
        }

        startMark('ai.run');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 遺꾩꽍 以?..';
        out.innerHTML = '';
        log.innerHTML = '';
        aiContainer?.classList.add('fx-active');

        const request = this.buildStrategyRequest();
        this.app.data.save();
        const strategy = request.strategyId;

        const strategyNames = {
            ensemble_weighted: '?숈긽釉?媛以묒튂',
            stat_ac_sum: '?뺣? ?듦퀎(蹂듭옟???⑷퀎)',
            balance_oe_hl: '?吏?+ 怨좎? 洹좏삎',
            cold_frequency: '?鍮덈룄 諛섎벑',
            hot_frequency: '怨좊퉰??異붿쥌'
        };
        const selectedModelName = strategyNames[strategy] || getStrategyMeta(strategy).label || '?좏깮 ?꾨왂';

        const logs = [
            `?좏깮 紐⑤뜽: ${selectedModelName}`,
            '鍮덈룄/理쒓렐???⑦꽩 ?좏샇瑜?遺꾩꽍?⑸땲??..',
            '?꾨왂 媛以묒튂瑜?諛섏쁺?⑸땲??..',
            `紐ы뀒移대?濡쒕? ?ㅽ뻾?⑸땲??(${request.params.simulationCount.toLocaleString()}???쒕낯)...`,
            '理쒖쟻 ?꾨낫 議고빀??異붿텧?⑸땲??..'
        ];

        try {
            logs.forEach((msg) => this.appendLog(log, `> ${msg}`));

            let result = null;
            let results = [];
            let explanations = [];
            let fallback = false;
            startMark('ai.worker');
            try {
                result = await this.workerClient.recommend({
                    statsData: this.app.data.state.winningStats,
                    request,
                    setCount: 5
                });
                results = Array.isArray(result?.sets) ? result.sets : [];
                explanations = Array.isArray(result?.explanations) ? result.explanations : [];
            } catch (err) {
                fallback = true;
                if (this.isWorkerTimeoutError(err)) {
                    UIManager.toast('Worker timeout. Falling back to main-thread recommendation.', 'warning');
                }
                console.warn('AI 異붿쿇 ?뚯빱 ?ㅽ뙣, 硫붿씤 ?ㅻ젅?쒕줈 ?泥댄빀?덈떎.', err);
                this.engine = new StrategyEngine(this.app.data.state.winningStats);
                result = this.engine.recommendFromSimulation(request, { setCount: 5 });
                results = Array.isArray(result?.sets) ? result.sets : [];
                explanations = results.map((set) => this.engine.explainSet(set, request));
            } finally {
                endMark('ai.worker', { requested: 5, count: results.length, fallback });
            }

            if (!results || results.length === 0) throw new Error('?쒕??덉씠??寃곌낵媛 鍮꾩뼱 ?덉뒿?덈떎');
            if (!explanations.length) {
                this.engine = new StrategyEngine(this.app.data.state.winningStats);
                explanations = results.map((set) => this.engine.explainSet(set, request));
            }

            this.appendLog(log, '> 遺꾩꽍 ?꾨즺. 異붿쿇 議고빀 5媛쒕? ?앹꽦?덉뒿?덈떎.', 'var(--success)');
            const accepted = Number(result?.simulation?.diagnostics?.accepted || 0);
            const simulationCount = Number(result?.simulation?.diagnostics?.simulationCount || request.params.simulationCount || 0);
            this.appendLog(log, `> 梨꾪깮???쒕낯: ${accepted}/${simulationCount}`);

            this.app.data.state.aiResults = results;
            this.lastRequest = request;
            this.lastExplain = explanations;
            this.renderResults(results, explanations);
        } catch (e) {
            console.error('?멸났吏??遺꾩꽍 ?ㅻ쪟:', e);
            this.appendLog(log, `> ?ㅻ쪟: ${e.message}`, 'var(--danger)');
            UIManager.toast('遺꾩꽍 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph-bold ph-brain"></i> ?ㅼ떆 ?ㅽ뻾';
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
            const strategyLabel = exp ? getStrategyMeta(exp.strategyId).label : '';

            const row = document.createElement('div');
            row.className = 'ai-card-row';
            row.style.animationDelay = `${idx * 0.1}s`;

            const badgHtml = `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    ?⑷퀎: ${sum}
                </span>
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    蹂듭옟?? ${ac}
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
                     <button class="btn ghost sm pick-btn" data-nums="${set.join(',')}">?앹꽦 ??쑝濡?/button>
                     <button class="btn ghost sm ticket-btn" data-nums="${set.join(',')}">?곗폆 ???/button>
                </div>
                ${exp ? `
                <details class="ai-explain" style="margin-top:10px;">
                    <summary style="cursor:pointer; color:var(--text-muted);">?곸꽭 蹂닿린</summary>
                    <div style="margin-top:8px; font-size:12px; color:var(--text-muted);">
                        <div>?꾨왂: <b>${strategyLabel}</b> (洹쇨굅 ?깃툒 ${exp.evidenceTier})</div>
                        <div>媛以묒튂: <b>${exp.summary.setWeight}</b>, ?꾪꽣 ?듦낵: <b>${exp.filtersPass ? '?? : '?꾨땲??}</b></div>
                        <div style="margin-top:6px; display:grid; gap:4px;">
                            ${exp.signals.map((s) => `<div>#${s.number} 媛以묒튂:${s.weight} / 鍮덈룄:${s.frequencyScore} / 理쒓렐??${s.recencyScore} / 怨듬갚:${s.gapScore} / ?섏뼱:${s.pairScore}</div>`).join('')}
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
        const tierLabels = { A: '寃利앸맖', B: '?ъ슜 媛??, C: '?ㅽ뿕 ?④퀎' };
        const tierColors = { A: 'var(--success)', B: 'var(--primary)', C: 'var(--warning)' };

        const selectedCard = `
            <div class="guide-selected">
                <div class="guide-selected-header">
                    <h3><i class="ph-bold ph-book-open"></i> ?꾩옱 ?좏깮 紐⑤뜽</h3>
                    <span class="guide-tier-badge" style="border-color: ${tierColors[selectedMeta.tier]}; color: ${tierColors[selectedMeta.tier]};">
                        ${tierIcons[selectedMeta.tier]} ?깃툒 ${selectedMeta.tier} - ${tierLabels[selectedMeta.tier]}
                    </span>
                </div>
                <div class="guide-selected-body">
                    <h4>${selectedMeta.label}</h4>
                    <p class="guide-desc">${selectedMeta.description || selectedMeta.summary}</p>
                    ${selectedMeta.experimental ? '<div class="guide-warning"><i class="ph-bold ph-warning"></i> ?ㅽ뿕 ?④퀎 紐⑤뜽?낅땲?? ?ъ슜 ?꾩뿉 ?쒕??덉씠??寃利앹쓣 沅뚯옣?⑸땲??</div>' : ''}
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
                        ${s.experimental ? '<span class="guide-exp-tag">?ㅽ뿕</span>' : ''}
                    </div>
                    <p>${s.summary}</p>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            ${selectedCard}
            <div class="guide-all-header">
                <h3><i class="ph-bold ph-list-bullets"></i> ?꾨왂 媛쒖슂</h3>
                <span class="guide-count">${allStrategies.length}媛??꾨왂</span>
            </div>
            <div class="guide-grid">${gridItems}</div>
            <div class="guide-filter-notice">
                <i class="ph-bold ph-info"></i>
                <span>?꾪꽣 議곌굔???덈Т ?꾧꺽?섎㈃ ?좏슚 議고빀??以꾩뼱?ㅺ퀬, 蹂댁셿 ?쒕뜡 ?앹꽦 鍮꾩쨷??而ㅼ쭏 ???덉뒿?덈떎.</span>
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
        if (filters.oddEven) parts.push(`???${filters.oddEven[0]}-${filters.oddEven[1]}`);
        if (filters.highLow) parts.push(`怨좎닔 ${filters.highLow[0]}-${filters.highLow[1]}`);
        if (filters.sumRange) parts.push(`?⑷퀎 ${filters.sumRange[0]}-${filters.sumRange[1]}`);
        if (filters.acRange) parts.push(`蹂듭옟??${filters.acRange[0]}-${filters.acRange[1]}`);
        if (filters.maxConsecutivePairs != null) parts.push(`?곗냽????${filters.maxConsecutivePairs}`);
        if (filters.endDigitUniqueMin != null) parts.push(`?앹닔 醫낅쪟 ??${filters.endDigitUniqueMin}`);
        if (!parts.length) return '';
        return `<div class="guide-default-filters"><strong>湲곕낯 ?꾪꽣:</strong> ${parts.join(' / ')}</div>`;
    }
}

