import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { StrategyEngine } from '../../core/StrategyEngine.js';
import { AdvancedMonteCarlo } from '../../core/MonteCarlo.js';
import { getStrategyMeta, STRATEGY_CATALOG, resolveStrategyId } from '../../core/StrategyCatalog.js';
import { endMark, startMark } from '../../utils/perf.js';
import { UI_STRINGS } from '../../utils/strings.js';

function formatAdaptiveSelection(adaptive = null) {
    if (!adaptive || !Array.isArray(adaptive.selectedStrategies) || !adaptive.selectedStrategies.length) {
        return '';
    }

    return adaptive.selectedStrategies
        .map((item) => `${getStrategyMeta(item.strategyId).label}(${Number(item.compositeScore || 0).toFixed(1)})`)
        .join(' + ');
}

export const aiRenderingMethods = {
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
        const targetSetCount = 5;
        const selectedModelName = getStrategyMeta(request.strategyId).label || '선택 전략';

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
                    setCount: targetSetCount
                });
                results = Array.isArray(result?.sets) ? result.sets : [];
                explanations = Array.isArray(result?.explanations) ? result.explanations : [];
            } catch (err) {
                fallback = true;
                if (this.isWorkerTimeoutError(err)) {
                    UIManager.toast(UI_STRINGS.ai.workerFallback, 'warning');
                }
                console.warn('AI 추천 워커 실패, 메인 스레드로 대체합니다.', err);
                this.engine = new StrategyEngine(this.app.data.state.winningStats);
                result = this.engine.recommendFromSimulation(request, { setCount: targetSetCount });
                results = Array.isArray(result?.sets) ? result.sets : [];
                explanations = results.map((set) => this.engine.explainSet(set, request));
            } finally {
                endMark('ai.worker', { requested: targetSetCount, count: results.length, fallback });
            }

            if (!results || results.length === 0) {
                throw new Error('시뮬레이션 결과가 비어 있습니다');
            }
            if (!explanations.length) {
                this.engine = new StrategyEngine(this.app.data.state.winningStats);
                explanations = results.map((set) => this.engine.explainSet(set, request));
            }

            if (results.length < targetSetCount) {
                this.appendLog(log, `> 분석 완료. 추천 조합 ${results.length}/${targetSetCount}개를 생성했습니다.`, 'var(--warning)');
                UIManager.toast(`필터 조건으로 ${results.length}/${targetSetCount}개만 생성되었습니다.`, 'warning', 3500);
            } else {
                this.appendLog(log, `> 분석 완료. 추천 조합 ${results.length}개를 생성했습니다.`, 'var(--success)');
            }

            const diagnostics = result?.simulation?.diagnostics || {};
            const accepted = Number(diagnostics.accepted || 0);
            const simulationCount = Number(diagnostics.simulationCount || request.params.simulationCount || 0);
            this.appendLog(log, `> 채택된 샘플: ${accepted}/${simulationCount}`);

            const adaptive = diagnostics.adaptive || explanations[0]?.adaptive || null;
            if (adaptive?.evaluationWindow) {
                this.appendLog(log, `> 최근 ${adaptive.evaluationWindow}회 기준 자동 비교를 반영했습니다.`);
            }
            const adaptiveSelection = formatAdaptiveSelection(adaptive);
            if (adaptiveSelection) {
                this.appendLog(log, `> 자동 선택 결과: ${adaptiveSelection}`);
            }

            const candidatePool = Number(diagnostics.uniqueCandidates || 0);
            if (candidatePool > 0) {
                this.appendLog(log, `> 리랭킹 후보풀: ${candidatePool}개`);
            }
            const topScore = Number(diagnostics.topScore || 0);
            if (topScore > 0) {
                this.appendLog(log, `> 최고 추천 점수: ${topScore.toFixed(4)}`);
            }

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
    },

    renderResults(results, explanations = []) {
        const out = $('#aiOutput');
        if (!out) return;

        out.innerHTML = '';
        results.forEach((set, idx) => {
            const sum = AdvancedMonteCarlo.calculateSum(set);
            const ac = AdvancedMonteCarlo.calculateAC(set);
            const exp = explanations[idx];
            const strategyLabel = exp ? getStrategyMeta(exp.strategyId).label : '';
            const adaptive = exp?.adaptive || null;

            const row = document.createElement('div');
            row.className = 'ai-card-row';
            row.style.animationDelay = `${idx * 0.1}s`;

            const badgeHtml = `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    합계: ${sum}
                </span>
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    복잡도: ${ac}
                </span>
                ${exp ? `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--primary); font-size:11px;">
                    점수: ${Number(exp.summary.recommendationScore || 0).toFixed(3)}
                </span>` : ''}
            `;

            const ballsHtml = set.map((n) => {
                const colorClass = n <= 10
                    ? 'yellow'
                    : n <= 20
                        ? 'blue'
                        : n <= 30
                            ? 'red'
                            : n <= 40
                                ? 'gray'
                                : 'green';
                return `<span class="ball ${colorClass}">${n}</span>`;
            }).join('');

            row.innerHTML = `
                <div class="ai-card-header" style="justify-content:space-between; display:flex; margin-bottom:8px;">
                    <span class="rank-badge">#${idx + 1}</span>
                    <div class="meta-badges" style="display:flex; gap:4px;">${badgeHtml}</div>
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
                        ${adaptive ? `<div>자동 선택: <b>${formatAdaptiveSelection(adaptive)}</b></div>` : ''}
                        <div>가중치: <b>${exp.summary.setWeight}</b>, 추천 점수: <b>${Number(exp.summary.recommendationScore || 0).toFixed(4)}</b>, 필터 통과: <b>${exp.filtersPass ? '예' : '아니오'}</b></div>
                        <div>페어 시너지: <b>${Number(exp.summary.pairSynergy || 0).toFixed(4)}</b>, 프로파일 적합도: <b>${Number(exp.summary.profileScore || 0).toFixed(4)}</b>, 공백 균형: <b>${Number(exp.summary.gapBalanceScore || 0).toFixed(4)}</b></div>
                        <div style="margin-top:6px; display:grid; gap:4px;">
                            ${exp.signals.map((s) => `<div>#${s.number} 가중치:${s.weight} / 빈도:${s.frequencyScore} / 최근성:${s.recencyScore} / 공백:${s.gapScore} / 페어:${s.pairScore} / 추세:${s.trendScore} / 회귀:${s.overdueRatio} / 베이즈:${s.bayesScore}</div>`).join('')}
                        </div>
                    </div>
                </details>` : ''}
            `;

            out.appendChild(row);
        });
    },

    renderModelGuide() {
        const container = $('#aiModelGuideContainer');
        if (!container) return;

        const selectedId = resolveStrategyId($('#aiModelSelect')?.value || 'ensemble_weighted');
        const selectedMeta = getStrategyMeta(selectedId);
        const includeExperimental = Boolean($('#aiShowExperimental')?.checked);
        const allStrategies = Object.values(STRATEGY_CATALOG).filter((s) => {
            if (!includeExperimental && s.experimental) return false;
            if (Array.isArray(s.scopes) && !s.scopes.includes('ai')) return false;
            return true;
        });

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
                    ${(selectedId === 'auto_recent_top' || selectedId === 'auto_ensemble_top3')
                        ? '<div class="guide-warning"><i class="ph-bold ph-sparkle"></i> 최근 참조 회차 수 입력값이 자동 비교에 사용됩니다.</div>'
                        : ''}
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
                <span>조건이 너무 엄격하면 요청 수량보다 적게 생성될 수 있으며, 필터를 통과한 조합만 반환됩니다.</span>
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
    },

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
};
