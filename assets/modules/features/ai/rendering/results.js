import { $ } from '../../../utils/utils.js';
import { AdvancedMonteCarlo } from '../../../core/MonteCarlo.js';
import { getStrategyMeta } from '../../../core/StrategyCatalog.js';
import { upsertReproductionCodeBar } from '../../../utils/reproductionCode.js';
import { formatAdaptiveSelection, formatTierLabel } from './formatters.js';

export const aiRenderingResultsMethods = {
    renderResults(results, explanations = [], options = {}) {
        const out = $('#aiOutput');
        if (!out) return;
        const notice = $('#aiResultTempNotice');
        if (notice) notice.hidden = !results.length;

        out.innerHTML = '';
        upsertReproductionCodeBar({
            host: out,
            barId: 'aiReproductionCode',
            seed: options.runtimeSeed ?? this.lastRuntimeSeed,
            request: options.request ?? this.lastRequest
        });
        results.forEach((set, idx) => {
            const sum = AdvancedMonteCarlo.calculateSum(set);
            const ac = AdvancedMonteCarlo.calculateAC(set);
            const exp = explanations[idx];
            const strategyLabel = exp ? getStrategyMeta(exp.strategyId).label : '';
            const adaptive = exp?.adaptive || null;

            const row = document.createElement('div');
            row.className = 'ai-card-row';
            row.style.animationDelay = `${idx * 0.06}s`;

            const oddCount = set.filter((n) => n % 2 === 1).length;
            const badgeHtml = `
                <span class="meta-badge">합계 ${sum}</span>
                <span class="meta-badge">홀짝 ${oddCount}:${set.length - oddCount}</span>
                <span class="meta-badge" title="숫자가 클수록 번호가 고르게 흩어져 있어요">섞임 ${ac}</span>
            `;

            const ballsHtml = set
                .map((n) => {
                    const colorClass =
                        n <= 10 ? 'yellow' : n <= 20 ? 'blue' : n <= 30 ? 'red' : n <= 40 ? 'gray' : 'green';
                    return `<span class="ball ${colorClass}">${n}</span>`;
                })
                .join('');

            row.innerHTML = `
                <div class="ai-card-header">
                    <span class="rank-badge">${idx + 1}번째 추천</span>
                    <div class="meta-badges">${badgeHtml}</div>
                </div>
                <div class="ball-container left">${ballsHtml}</div>
                <div class="row-actions ai-card-actions">
                    <button class="btn ghost sm pick-btn" type="button" data-nums="${set.join(',')}"><i class="ph ph-pencil-simple"></i> 생성 탭에서 이어서</button>
                    <button class="btn primary sm ticket-btn" type="button" data-nums="${set.join(',')}"><i class="ph ph-ticket"></i> 구매 번호로 저장</button>
                </div>
                ${
                    exp
                        ? `
                <details class="ai-explain">
                    <summary>왜 이 번호인가요?</summary>
                    <div class="ai-explain-body">
                        <div>추천 방식: <b>${strategyLabel}</b> (${formatTierLabel(exp.evidenceTier)})</div>
                        ${adaptive ? `<div>자동으로 고른 방식: <b>${formatAdaptiveSelection(adaptive)}</b></div>` : ''}
                        <div>내부 랭킹 점수: <b>${Number(exp.summary.recommendationScore || 0).toFixed(3)}</b> · 세부 조건 통과: <b>${exp.filtersPass ? '예' : '아니오'}</b></div>
                        <div>짝꿍 번호 점수 <b>${Number(exp.summary.pairSynergy || 0).toFixed(3)}</b> · 과거 당첨 모양과 닮은 정도 <b>${Number(exp.summary.profileScore || 0).toFixed(3)}</b> · 쉬는 기간 균형 <b>${Number(exp.summary.gapBalanceScore || 0).toFixed(3)}</b></div>
                        <div class="ai-explain-signals">
                            ${exp.signals.map((s) => `<div><b>${s.number}번</b> 출현 ${s.frequencyScore} · 최근 ${s.recencyScore} · 쉬는 기간 ${s.gapScore} · 짝꿍 ${s.pairScore} · 흐름 ${s.trendScore}</div>`).join('')}
                        </div>
                    </div>
                </details>`
                        : ''
                }
            `;

            out.appendChild(row);
        });
    }
};