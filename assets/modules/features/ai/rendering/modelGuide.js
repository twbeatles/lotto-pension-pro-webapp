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

        const tierIcons = { A: 'A', B: 'B', C: 'C' };
        const tierLabels = { A: '기본', B: '확장', C: '실험' };
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
                    ${
                        selectedId === 'auto_recent_top' || selectedId === 'auto_ensemble_top3'
                            ? '<div class="guide-warning"><i class="ph-bold ph-sparkle"></i> 최근 참조 회차 입력값이 자동 비교에 사용되며, 실제 비교 구간은 최대 30회입니다.</div>'
                            : ''
                    }
                    ${selectedMeta.experimental ? '<div class="guide-warning"><i class="ph-bold ph-warning"></i> 실험 단계 모델입니다. 사용 전에 시뮬레이션 검증을 권장합니다.</div>' : ''}
                    ${this._renderDefaultFilters(selectedMeta)}
                </div>
            </div>
        `;

        const gridItems = allStrategies
            .map((s) => {
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
            })
            .join('');

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