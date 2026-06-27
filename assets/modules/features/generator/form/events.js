import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { applyAnalysisPresetToFields, syncAnalysisPresetSelect } from '../../../utils/analysisPresets.js';

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
                    UIManager.toast('번호 생성 중 오류가 발생했습니다.', 'error');
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
                    UIManager.toast('캠페인 생성 중 오류가 발생했습니다.', 'error');
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
                    this.app.data.addToFavorites(nums);
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
                        UIManager.toast('내 번호 보관함 추가에 실패했습니다.', 'error');
                    } else {
                        UIManager.toast(
                            result.incremented
                                ? `${targetDrawNo}회차 동일 티켓 수량을 x${result.quantity}로 늘렸습니다.`
                                : `${targetDrawNo}회차 내 번호 보관함에 추가했습니다.`,
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
                        await UIManager.saveAsImage(itemEl, `로또_생성_${idx + 1}.png`);
                    } catch (err) {
                        console.error(err);
                        UIManager.toast('이미지 저장 실패', 'error');
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