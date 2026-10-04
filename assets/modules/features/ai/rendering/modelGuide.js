import { $ } from '../../../utils/utils.js';
import { getStrategyMeta, STRATEGY_CATALOG, resolveStrategyId } from '../../../core/StrategyCatalog.js';

export const aiRenderingModelGuideMethods = {
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

        const tierLabels = { A: '추천', B: '보조', C: '실험 중' };
        const tierColors = { A: 'var(--success)', B: 'var(--primary)', C: 'var(--warning)' };

        const selectedCard = `
            <div class="guide-selected">
                <div class="guide-selected-header">
                    <h3><i class="ph-bold ph-book-open"></i> 지금 고른 방식</h3>
                    <span class="guide-tier-badge" style="border-color: ${tierColors[selectedMeta.tier]}; color: ${tierColors[selectedMeta.tier]};">
                        ${tierLabels[selectedMeta.tier] || '참고'}
                    </span>
                </div>
                <div class="guide-selected-body">
                    <h4>${selectedMeta.label}</h4>
                    <p class="guide-desc">${selectedMeta.description || selectedMeta.summary}</p>
                    ${
                        selectedId === 'auto_recent_top' || selectedId === 'auto_ensemble_top3'
                            ? '<div class="guide-warning"><i class="ph-bold ph-sparkle"></i> 최근 회차 성적을 비교해 자동으로 고릅니다. 비교는 최대 30회까지 봅니다.</div>'
                            : ''
                    }
                    ${selectedMeta.experimental ? '<div class="guide-warning"><i class="ph-bold ph-warning"></i> 아직 실험 중인 방식이에요. 시뮬레이션 탭에서 과거 성적을 먼저 확인해 보세요.</div>' : ''}
                    ${this._renderDefaultFilters(selectedMeta)}
                </div>
            </div>
        `;

        const gridItems = allStrategies
            .map((s) => {
                const isActive = s.id === selectedId;
                return `
                <button type="button" class="guide-item ${isActive ? 'active' : ''}" data-strategy-id="${s.id}" aria-pressed="${isActive}">
                    <span class="guide-item-head">
                        <span class="guide-item-tier" style="background: ${tierColors[s.tier]};" aria-hidden="true"></span>
                        <strong>${s.label}</strong>
                        ${s.experimental ? '<span class="guide-exp-tag">실험 중</span>' : ''}
                    </span>
                    <span class="guide-item-summary">${s.summary}</span>
                </button>
            `;
            })
            .join('');

        container.innerHTML = `
            ${selectedCard}
            <div class="guide-all-header">
                <h3><i class="ph-bold ph-list-bullets"></i> 추천 방식 한눈에 보기</h3>
                <span class="guide-count">${allStrategies.length}가지 · 눌러서 바로 선택</span>
            </div>
            <div class="guide-grid">${gridItems}</div>
            <div class="guide-filter-notice">
                <i class="ph-bold ph-info"></i>
                <span>세부 조건을 너무 좁게 잡으면 요청한 개수보다 적게 나올 수 있어요.</span>
            </div>
        `;

        container.querySelectorAll('.guide-item').forEach((item) => {
            item.addEventListener('click', () => {
                const stratId = item.dataset.strategyId;
                const select = $('#aiModelSelect');
                if (select && [...select.options].some((o) => o.value === stratId)) {
                    select.value = stratId;
                    // The select change handler re-renders this guide.
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    select.focus({ preventScroll: true });
                }
            });
        });
    },

    _renderDefaultFilters(meta) {
        const filters = meta.defaultFilters || {};
        const parts = [];
        if (filters.oddEven) parts.push(`홀수 ${filters.oddEven[0]}-${filters.oddEven[1]}`);
        if (filters.highLow) parts.push(`큰 번호 ${filters.highLow[0]}-${filters.highLow[1]}`);
        if (filters.sumRange) parts.push(`합계 ${filters.sumRange[0]}-${filters.sumRange[1]}`);
        if (filters.acRange) parts.push(`섞임 정도 ${filters.acRange[0]}-${filters.acRange[1]}`);
        if (filters.maxConsecutivePairs != null) parts.push(`연속 번호 쌍 ${filters.maxConsecutivePairs}개 이하`);
        if (filters.endDigitUniqueMin != null) parts.push(`끝자리 ${filters.endDigitUniqueMin}종류 이상`);
        if (!parts.length) return '';
        return `<div class="guide-default-filters"><strong>기본 조건:</strong> ${parts.join(' / ')}</div>`;
    }
};