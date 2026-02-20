import { $, sleep } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { StrategyEngine } from '../core/StrategyEngine.js';
import { listStrategies, resolveStrategyId, getStrategyMeta, STRATEGY_CATALOG } from '../core/StrategyCatalog.js';
import { AdvancedMonteCarlo } from '../core/MonteCarlo.js';

export class AiModule {
    constructor(app) {
        this.app = app;
        this.engine = new StrategyEngine(this.app.data.state.winningStats);
        this.lastRequest = null;
        this.lastExplain = [];
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

        // Restore state if available
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
            option.textContent = `${item.label} (Tier ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(option);
        });

        // Legacy aliases remain available for backward compatibility
        const legacy = [
            ['ensemble', 'Legacy: 앙상블'],
            ['statistical', 'Legacy: 정밀 통계'],
            ['balance', 'Legacy: 패턴 밸런스'],
            ['cold', 'Legacy: 콜드 포커스'],
            ['hot', 'Legacy: 핫 포커스']
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

    async run() {
        const btn = $('#aiPredictBtn');
        const out = $('#aiOutput');
        const log = $('#aiLogArea');

        if (!this.app.data.state.winningStats.length) {
            UIManager.toast('당첨 데이터가 없습니다. (data/winning_stats.json)', 'error', 3000);
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 분석 중...';
        out.innerHTML = '';
        log.innerHTML = '';

        const request = this.buildStrategyRequest();
        this.app.data.save();
        const strategy = request.strategyId;

        const strategyNames = {
            ensemble_weighted: '앙상블 가중치',
            stat_ac_sum: '정밀 통계 (AC/합계)',
            balance_oe_hl: '홀짝/고저 밸런스',
            cold_frequency: '콜드 포커스',
            hot_frequency: '핫 포커스'
        };

        const LOGS = [
            `선택된 모델: ${strategyNames[strategy] || strategy}`,
            '데이터 패턴 학습 (Frequency, Recency, Pattern)...',
            '전략별 가중치 재조정...',
            `몬테카를로 시뮬레이션 (${request.params.simulationCount.toLocaleString()}회 수행)...`,
            '최적 번호 조합 추출 중...'
        ];

        try {
            for (const msg of LOGS) {
                log.innerHTML += `<div>> ${msg}</div>`;
                await sleep(400); // Simulate processing time
                log.scrollTop = log.scrollHeight;
            }

            this.engine = new StrategyEngine(this.app.data.state.winningStats);
            await sleep(100);

            const result = this.engine.recommendFromSimulation(request, { setCount: 5 });
            const results = result.sets;
            if (!results || results.length === 0) throw new Error('Simulation returned empty results');
            const explanations = results.map((set) => this.engine.explainSet(set, request));

            log.innerHTML += `<div style="color:var(--success)">> 분석 완료! 5개 추천 조합 생성.</div>`;
            log.innerHTML += `<div>> 유효 샘플: ${result.simulation.diagnostics.accepted}/${result.simulation.diagnostics.simulationCount}</div>`;
            log.scrollTop = log.scrollHeight;

            // Save state
            this.app.data.state.aiResults = results;
            this.lastRequest = request;
            this.lastExplain = explanations;
            this.renderResults(results, explanations);

        } catch (e) {
            console.error('AI Error:', e);
            log.innerHTML += `<div style="color:var(--danger)">> 오류 발생: ${e.message}</div>`;
            log.scrollTop = log.scrollHeight;
            UIManager.toast('분석 중 오류가 발생했습니다.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph-bold ph-brain"></i> 재분석';
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

            // Badges
            let badgHtml = `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    합계: ${sum}
                </span>
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    AC: ${ac}
                </span>
            `;

            // Ball HTML
            const ballsHtml = set.map(n => {
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
                     <button class="btn ghost sm pick-btn" data-nums="${set.join(',')}">선택</button>
                     <button class="btn ghost sm ticket-btn" data-nums="${set.join(',')}">티켓북</button>
                </div>
                ${exp ? `
                <details class="ai-explain" style="margin-top:10px;">
                    <summary style="cursor:pointer; color:var(--text-muted);">근거 보기</summary>
                    <div style="margin-top:8px; font-size:12px; color:var(--text-muted);">
                        <div>전략: <b>${exp.strategyId}</b> (Tier ${exp.evidenceTier})</div>
                        <div>세트 점수: <b>${exp.summary.setWeight}</b>, 필터 통과: <b>${exp.filtersPass ? 'YES' : 'NO'}</b></div>
                        <div style="margin-top:6px; display:grid; gap:4px;">
                            ${exp.signals.map((s) => `<div>#${s.number} w:${s.weight} / f:${s.frequencyScore} / r:${s.recencyScore} / g:${s.gapScore} / p:${s.pairScore}</div>`).join('')}
                        </div>
                    </div>
                </details>` : ''}
            `;

            out.appendChild(row);
        });

        // Bind events
        out.querySelectorAll('.pick-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                const nums = e.target.dataset.nums.split(',').map(Number);
                this.app.requestNumbers(nums);
            });
        });
        out.querySelectorAll('.ticket-btn').forEach((b) => {
            b.addEventListener('click', (e) => {
                const nums = e.target.dataset.nums.split(',').map(Number);
                const targetDrawNo = this.getAiTargetDrawNo();
                const added = this.app.data.addTicket(nums, {
                    source: 'ai',
                    targetDrawNo,
                    strategyRequest: this.lastRequest || this.buildStrategyRequest()
                });
                if (!added) UIManager.toast('이미 티켓북에 있습니다.', 'warning');
                else {
                    UIManager.toast(`${targetDrawNo}회차 티켓북에 추가되었습니다.`, 'success');
                    if (this.app.renderDataLists) this.app.renderDataLists();
                }
            });
        });
    }

    renderModelGuide() {
        const container = $('#aiModelGuideContainer');
        if (!container) return;

        const selectedId = resolveStrategyId($('#aiModelSelect')?.value || 'ensemble_weighted');
        const selectedMeta = getStrategyMeta(selectedId);
        const includeExperimental = Boolean($('#aiShowExperimental')?.checked);
        const allStrategies = Object.values(STRATEGY_CATALOG).filter(s => includeExperimental || !s.experimental);

        const tierIcons = { A: '🏆', B: '⭐', C: '🔬' };
        const tierLabels = { A: '검증됨', B: '유용함', C: '실험적' };
        const tierColors = { A: 'var(--success)', B: 'var(--primary)', C: 'var(--warning)' };

        // Selected model detail card
        const selectedCard = `
            <div class="guide-selected">
                <div class="guide-selected-header">
                    <h3><i class="ph-bold ph-book-open"></i> 현재 선택된 모델</h3>
                    <span class="guide-tier-badge" style="border-color: ${tierColors[selectedMeta.tier]}; color: ${tierColors[selectedMeta.tier]};">
                        ${tierIcons[selectedMeta.tier]} Tier ${selectedMeta.tier} · ${tierLabels[selectedMeta.tier]}
                    </span>
                </div>
                <div class="guide-selected-body">
                    <h4>${selectedMeta.label}</h4>
                    <p class="guide-desc">${selectedMeta.description || selectedMeta.summary}</p>
                    ${selectedMeta.experimental ? '<div class="guide-warning"><i class="ph-bold ph-warning"></i> 이 모델은 실험(Experimental) 전략입니다. 백테스트를 통해 성능 검증 후 사용을 추천합니다.</div>' : ''}
                    ${this._renderDefaultFilters(selectedMeta)}
                </div>
            </div>
        `;

        // All models overview grid
        const gridItems = allStrategies.map(s => {
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
                <h3><i class="ph-bold ph-list-bullets"></i> 전체 모델 요약</h3>
                <span class="guide-count">${allStrategies.length}개 전략</span>
            </div>
            <div class="guide-grid">${gridItems}</div>
            <div class="guide-filter-notice">
                <i class="ph-bold ph-info"></i>
                <span>필터(홀짝/합계/AC 등)를 과도하게 좁히면 유효한 조합이 부족해져 <strong>Fallback(랜덤)</strong>으로 대체될 수 있습니다. 적정 범위를 유지해 주세요.</span>
            </div>
        `;

        // Click on guide-item to switch strategy
        container.querySelectorAll('.guide-item').forEach(item => {
            item.addEventListener('click', () => {
                const stratId = item.dataset.strategyId;
                const select = $('#aiModelSelect');
                if (select && [...select.options].some(o => o.value === stratId)) {
                    select.value = stratId;
                    this.renderModelGuide();
                }
            });
        });
    }

    _renderDefaultFilters(meta) {
        const filters = meta.defaultFilters || {};
        const parts = [];
        if (filters.oddEven) parts.push(`홀수 ${filters.oddEven[0]}~${filters.oddEven[1]}개`);
        if (filters.highLow) parts.push(`고수 ${filters.highLow[0]}~${filters.highLow[1]}개`);
        if (filters.sumRange) parts.push(`합계 ${filters.sumRange[0]}~${filters.sumRange[1]}`);
        if (filters.acRange) parts.push(`AC ${filters.acRange[0]}~${filters.acRange[1]}`);
        if (filters.maxConsecutivePairs != null) parts.push(`연속쌍 ≤${filters.maxConsecutivePairs}`);
        if (filters.endDigitUniqueMin != null) parts.push(`끝수종류 ≥${filters.endDigitUniqueMin}`);
        if (!parts.length) return '';
        return `<div class="guide-default-filters"><strong>기본 적용 필터:</strong> ${parts.join(' · ')}</div>`;
    }
}
