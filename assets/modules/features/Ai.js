import { $, sleep } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { StrategyEngine } from '../core/StrategyEngine.js';
import { listStrategies, resolveStrategyId } from '../core/StrategyCatalog.js';
import { AdvancedMonteCarlo } from '../core/MonteCarlo.js';

export class AiModule {
    constructor(app) {
        this.app = app;
        this.engine = new StrategyEngine(this.app.data.state.winningStats);
        const btn = $('#aiPredictBtn');
        if (btn) btn.addEventListener('click', () => this.run());
        $('#aiShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();

        // Restore state if available
        if (this.app.data.state.aiResults && this.app.data.state.aiResults.length > 0) {
            this.renderResults(this.app.data.state.aiResults);
        }
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

            log.innerHTML += `<div style="color:var(--success)">> 분석 완료! 5개 추천 조합 생성.</div>`;
            log.innerHTML += `<div>> 유효 샘플: ${result.simulation.diagnostics.accepted}/${result.simulation.diagnostics.simulationCount}</div>`;
            log.scrollTop = log.scrollHeight;

            // Save state
            this.app.data.state.aiResults = results;
            this.renderResults(results);

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

    renderResults(results) {
        const out = $('#aiOutput');
        if (!out) return;

        out.innerHTML = '';
        results.forEach((set, idx) => {
            const sum = AdvancedMonteCarlo.calculateSum(set);
            const ac = AdvancedMonteCarlo.calculateAC(set);

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
                </div>
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
    }
}
