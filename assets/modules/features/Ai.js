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
            option.textContent = `${item.label} (등급 ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(option);
        });

        // Legacy aliases
        const legacy = [
            ['ensemble', 'Legacy model: Ensemble'],
            ['statistical', 'Legacy model: Statistical'],
            ['balance', 'Legacy model: Balance'],
            ['cold', 'Legacy model: Cold'],
            ['hot', 'Legacy model: Hot']
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
            if (!added) UIManager.toast('이미 티켓북에 있는 번호입니다.', 'warning');
            else {
                UIManager.toast(`${targetDrawNo}회차 티켓을 티켓북에 추가했습니다.`, 'success');
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
            UIManager.toast('당첨 데이터가 없습니다. 데이터 파일을 확인해주세요.', 'error', 3000);
            return;
        }

        startMark('ai.run');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 분석 중...';
        out.innerHTML = '';
        log.innerHTML = '';
        aiContainer?.classList.add('fx-active');

        const request = this.buildStrategyRequest();
        this.app.data.save();
        const strategy = request.strategyId;

        const strategyNames = {
            ensemble_weighted: '앙상블 가중치',
            stat_ac_sum: '정밀 통계(복잡도/합계)',
            balance_oe_hl: '홀짝/고저 밸런스',
            cold_frequency: '저빈도 반등',
            hot_frequency: '고빈도 추종'
        };
        const selectedModelName = strategyNames[strategy] || getStrategyMeta(strategy).label || '선택 전략';

        const logs = [
            `선택 모델: ${selectedModelName}`,
            '빈도, 최근성, 출현 간격 신호를 분석합니다...',
            '전략 가중치를 반영합니다...',
            `몬테카를로를 실행합니다(${request.params.simulationCount.toLocaleString()}회 샘플)...`,
            '최적 후보 조합을 추출합니다...'
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
                console.warn('AI 추천 워커 실패, 메인 스레드로 대체합니다.', err);
                this.engine = new StrategyEngine(this.app.data.state.winningStats);
                result = this.engine.recommendFromSimulation(request, { setCount: 5 });
                results = Array.isArray(result?.sets) ? result.sets : [];
                explanations = results.map((set) => this.engine.explainSet(set, request));
            } finally {
                endMark('ai.worker', { requested: 5, count: results.length, fallback });
            }

            if (!results || results.length === 0) throw new Error('시뮬레이션 결과가 비어 있습니다');
            if (!explanations.length) {
                this.engine = new StrategyEngine(this.app.data.state.winningStats);
                explanations = results.map((set) => this.engine.explainSet(set, request));
            }

            this.appendLog(log, '> 분석 완료. 추천 조합 5개를 생성했습니다.', 'var(--success)');
            const accepted = Number(result?.simulation?.diagnostics?.accepted || 0);
            const simulationCount = Number(result?.simulation?.diagnostics?.simulationCount || request.params.simulationCount || 0);
            this.appendLog(log, `> 채택된 샘플: ${accepted}/${simulationCount}`);

            this.app.data.state.aiResults = results;
            this.lastRequest = request;
            this.lastExplain = explanations;
            this.renderResults(results, explanations);
        } catch (e) {
            console.error('인공지능 분석 오류:', e);
            this.appendLog(log, `> 오류: ${e.message}`, 'var(--danger)');
            UIManager.toast('분석 중 오류가 발생했습니다.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph-bold ph-brain"></i> 다시 실행';
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
                    합계: ${sum}
                </span>
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    복잡도: ${ac}
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
                     <button class="btn ghost sm pick-btn" data-nums="${set.join(',')}">생성 탭으로</button>
                     <button class="btn ghost sm ticket-btn" data-nums="${set.join(',')}">티켓 저장</button>
                </div>
                ${exp ? `
                <details class="ai-explain" style="margin-top:10px;">
                    <summary style="cursor:pointer; color:var(--text-muted);">상세 보기</summary>
                    <div style="margin-top:8px; font-size:12px; color:var(--text-muted);">
                        <div>전략: <b>${strategyLabel}</b> (근거 등급 ${exp.evidenceTier})</div>
                        <div>가중치: <b>${exp.summary.setWeight}</b>, 필터 통과: <b>${exp.filtersPass ? '예' : '아니오'}</b></div>
                        <div style="margin-top:6px; display:grid; gap:4px;">
                            ${exp.signals.map((s) => `<div>#${s.number} 가중치:${s.weight} / 빈도:${s.frequencyScore} / 최근성:${s.recencyScore} / 공백:${s.gapScore} / 페어:${s.pairScore}</div>`).join('')}
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
        const tierLabels = { A: '검증됨', B: '사용 가능', C: '실험 단계' };
        const tierColors = { A: 'var(--success)', B: 'var(--primary)', C: 'var(--warning)' };

        const selectedCard = `
            <div class="guide-selected">
                <div class="guide-selected-header">
                    <h3><i class="ph-bold ph-book-open"></i> 현재 선택 모델</h3>
                    <span class="guide-tier-badge" style="border-color: ${tierColors[selectedMeta.tier]}; color: ${tierColors[selectedMeta.tier]};">
                        ${tierIcons[selectedMeta.tier]} 등급 ${selectedMeta.tier} - ${tierLabels[selectedMeta.tier]}
                    </span>
                </div>
                <div class="guide-selected-body">
                    <h4>${selectedMeta.label}</h4>
                    <p class="guide-desc">${selectedMeta.description || selectedMeta.summary}</p>
                    ${selectedMeta.experimental ? '<div class="guide-warning"><i class="ph-bold ph-warning"></i> 실험 단계 모델입니다. 사용 전에 시뮬레이션 검증을 권장합니다.</div>' : ''}
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
                        ${s.experimental ? '<span class="guide-exp-tag">실험</span>' : ''}
                    </div>
                    <p>${s.summary}</p>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            ${selectedCard}
            <div class="guide-all-header">
                <h3><i class="ph-bold ph-list-bullets"></i> 전략 개요</h3>
                <span class="guide-count">${allStrategies.length}개 전략</span>
            </div>
            <div class="guide-grid">${gridItems}</div>
            <div class="guide-filter-notice">
                <i class="ph-bold ph-info"></i>
                <span>필터 조건이 너무 엄격하면 유효 조합이 줄어들고, 보완 랜덤 생성 비중이 커질 수 있습니다.</span>
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
        if (filters.oddEven) parts.push(`홀수 ${filters.oddEven[0]}-${filters.oddEven[1]}`);
        if (filters.highLow) parts.push(`고수 ${filters.highLow[0]}-${filters.highLow[1]}`);
        if (filters.sumRange) parts.push(`합계 ${filters.sumRange[0]}-${filters.sumRange[1]}`);
        if (filters.acRange) parts.push(`복잡도 ${filters.acRange[0]}-${filters.acRange[1]}`);
        if (filters.maxConsecutivePairs != null) parts.push(`연속쌍 <= ${filters.maxConsecutivePairs}`);
        if (filters.endDigitUniqueMin != null) parts.push(`끝수 종류 >= ${filters.endDigitUniqueMin}`);
        if (!parts.length) return '';
        return `<div class="guide-default-filters"><strong>기본 필터:</strong> ${parts.join(' / ')}</div>`;
    }
}

