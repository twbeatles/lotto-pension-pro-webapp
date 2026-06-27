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
            row.style.animationDelay = `${idx * 0.1}s`;

            const badgeHtml = `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    합계: ${sum}
                </span>
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    복잡도: ${ac}
                </span>
                ${
                    exp
                        ? `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--primary); font-size:11px;">
                    랭킹: ${Number(exp.summary.recommendationScore || 0).toFixed(3)}
                </span>`
                        : ''
                }
            `;

            const ballsHtml = set
                .map((n) => {
                    const colorClass =
                        n <= 10 ? 'yellow' : n <= 20 ? 'blue' : n <= 30 ? 'red' : n <= 40 ? 'gray' : 'green';
                    return `<span class="ball ${colorClass}">${n}</span>`;
                })
                .join('');

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
                <p class="result-disclaimer" style="margin-top:8px;">재미와 참고용이며 당첨을 보장하지 않습니다.</p>
                ${
                    exp
                        ? `
                <details class="ai-explain" style="margin-top:10px;">
                    <summary style="cursor:pointer; color:var(--text-muted);">상세 보기</summary>
                    <div style="margin-top:8px; font-size:12px; color:var(--text-muted);">
                        <div>전략: <b>${strategyLabel}</b> (분류 ${formatTierLabel(exp.evidenceTier)})</div>
                        ${adaptive ? `<div>자동 선택: <b>${formatAdaptiveSelection(adaptive)}</b></div>` : ''}
                        <div>가중치: <b>${exp.summary.setWeight}</b>, 내부 랭킹 점수: <b>${Number(exp.summary.recommendationScore || 0).toFixed(4)}</b>, 필터 통과: <b>${exp.filtersPass ? '예' : '아니오'}</b></div>
                        <div>페어 시너지: <b>${Number(exp.summary.pairSynergy || 0).toFixed(4)}</b>, 프로파일 적합도: <b>${Number(exp.summary.profileScore || 0).toFixed(4)}</b>, 공백 균형: <b>${Number(exp.summary.gapBalanceScore || 0).toFixed(4)}</b></div>
                        <div style="margin-top:6px; display:grid; gap:4px;">
                            ${exp.signals.map((s) => `<div>#${s.number} 가중치:${s.weight} / 빈도:${s.frequencyScore} / 최근성:${s.recencyScore} / 공백:${s.gapScore} / 페어:${s.pairScore} / 추세:${s.trendScore} / 회귀:${s.overdueRatio} / 베이즈:${s.bayesScore}</div>`).join('')}
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