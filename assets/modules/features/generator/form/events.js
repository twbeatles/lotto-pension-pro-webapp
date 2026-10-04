import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { applyAnalysisPresetToFields, syncAnalysisPresetSelect } from '../../../utils/analysisPresets.js';

function markActionDone(btn, iconName) {
    const icon = btn?.querySelector('i');
    if (!icon) return;
    btn.classList.add('is-done');
    icon.className = `ph-fill ${iconName}`;
}

export const generatorFormEventMethods = {
    syncBusyButtons() {
        const anyBusy = this.isGenerating || this.isGeneratingCampaign;
        const generateBtn = $('#generateBtn');
        const campaignBtn = $('#generateCampaignBtn');
        const resetCampaignBtn = $('#resetCampaignBtn');
        const resetOptionsBtn = $('#resetOptions');

        if (generateBtn) {
            if (!this.generateBtnOriginalHtml) this.generateBtnOriginalHtml = generateBtn.innerHTML;
            generateBtn.disabled = anyBusy;
            generateBtn.innerHTML = this.isGenerating
                ? `<i class="ph ph-spinner ph-spin"></i> ${this.uiStrings.generating}`
                : this.generateBtnOriginalHtml;
        }

        if (campaignBtn) {
            if (!this.campaignBtnOriginalHtml) this.campaignBtnOriginalHtml = campaignBtn.innerHTML;
            campaignBtn.disabled = anyBusy;
            campaignBtn.innerHTML = this.isGeneratingCampaign
                ? `<i class="ph ph-spinner ph-spin"></i> ${this.uiStrings.generatingCampaign}`
                : this.campaignBtnOriginalHtml;
        }

        if (resetCampaignBtn) resetCampaignBtn.disabled = anyBusy;
        if (resetOptionsBtn) resetOptionsBtn.disabled = anyBusy;
    },

    bindEvents() {
        const btn = $('#generateBtn');
        if (btn)
            btn.addEventListener('click', () => {
                this.generate().catch((err) => {
                    console.error(err);
                    UIManager.toast('번호를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.', 'error');
                });
            });

        const resetBtn = $('#resetOptions');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetOptions());

        const clearBtn = $('#clearResults');
        if (clearBtn)
            clearBtn.addEventListener('click', () => {
                $('#genResultList').innerHTML = '';
                this.data.setGeneratedEntries([]);
                this.renderTemporaryResultNotice?.();
            });

        const saveAllBtn = $('#saveAllBtn');
        if (saveAllBtn) saveAllBtn.addEventListener('click', () => this.saveAll());
        const genCampaignBtn = $('#generateCampaignBtn');
        if (genCampaignBtn)
            genCampaignBtn.addEventListener('click', () => {
                this.generateCampaign().catch((err) => {
                    console.error(err);
                    UIManager.toast('회차 묶음 생성 중 오류가 발생했습니다.', 'error');
                });
            });
        const genCampaignResetBtn = $('#resetCampaignBtn');
        if (genCampaignResetBtn) genCampaignResetBtn.addEventListener('click', () => this.resetCampaignOptions());

        $('#genShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        $('#genStrategySelect')?.addEventListener('change', () => this.syncLegacyTogglesFromStrategy());
        $('#genAnalysisPreset')?.addEventListener('change', (e) => {
            if (e.currentTarget.value === 'custom') return;
            applyAnalysisPresetToFields('gen', e.currentTarget.value);
        });
        ['#genSimulationCount', '#genLookbackWindow'].forEach((selector) => {
            $(selector)?.addEventListener('input', () => syncAnalysisPresetSelect('gen'));
        });
        ['smartMode', 'preferHot', 'balanceMode'].forEach((id) => {
            $(`#${id}`)?.addEventListener('change', () => this.syncStrategyFromLegacyToggles());
        });

        if (!this.boundDelegation) {
            const listEl = $('#genResultList');
            listEl?.addEventListener('click', async (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const itemEl = e.target.closest('.result-item[data-idx]');
                if (!itemEl) return;

                const idx = Number(itemEl.dataset.idx);
                const entry = this.getGeneratedEntry(idx);
                const nums = entry?.numbers;
                if (!entry || !nums) return;

                const action = btn.dataset.action;
                if (action === 'copy') {
                    UIManager.copyNumbers(nums);
                    return;
                }
                if (action === 'qr') {
                    UIManager.showQR(nums);
                    return;
                }
                if (action === 'fav') {
                    const added = this.app.data.addToFavorites(nums);
                    if (added !== false) markActionDone(btn, 'ph-star');
                    if (this.app.renderDataLists) this.app.renderDataLists();
                    return;
                }
                if (action === 'ticket') {
                    const request = this.getStrategyRequestFromUI();
                    const targetDrawNo = this.readNumberInput(
                        'genTargetDrawNo',
                        (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1
                    );
                    const result =
                        this.saveGeneratedEntryToTicket(entry, targetDrawNo) ||
                        this.app.data.addTicket(nums, {
                            source: 'generator',
                            targetDrawNo,
                            strategyRequest: request
                        });
                    if (!result?.ticket) {
                        UIManager.toast('구매 번호로 저장하지 못했어요.', 'error');
                    } else {
                        markActionDone(btn, 'ph-ticket');
                        UIManager.toast(
                            result.incremented
                                ? `${targetDrawNo}회차에 같은 번호가 있어 수량을 ${result.quantity}장으로 늘렸어요.`
                                : `${targetDrawNo}회차 구매 번호로 저장했어요. 추첨 후 「당첨 확인」에서 결과를 볼 수 있어요.`,
                            'success'
                        );
                        if (this.app.renderDataLists) this.app.renderDataLists();
                    }
                    return;
                }
                if (action === 'share') {
                    const originalHTML = btn.innerHTML;
                    try {
                        btn.disabled = true;
                        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
                        await UIManager.saveAsImage(itemEl, `로또_번호_${String.fromCharCode(65 + (idx % 26))}.png`);
                    } catch (err) {
                        console.error(err);
                        UIManager.toast('이미지로 저장하지 못했어요.', 'error');
                    } finally {
                        btn.disabled = false;
                        btn.innerHTML = originalHTML;
                    }
                }
            });
            this.boundDelegation = true;
        }

        this.syncBusyButtons();
    }
};