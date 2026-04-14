import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { listStrategies, resolveStrategyId } from '../../core/StrategyCatalog.js';
export const generatorFormMethods = {
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
        if (btn) btn.addEventListener('click', () => {
            this.generate().catch((err) => {
                console.error(err);
                UIManager.toast('번호 생성 중 오류가 발생했습니다.', 'error');
            });
        });

        const resetBtn = $('#resetOptions');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetOptions());

        const clearBtn = $('#clearResults');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            $('#genResultList').innerHTML = '';
            this.data.setGeneratedEntries([]);
        });

        const saveAllBtn = $('#saveAllBtn');
        if (saveAllBtn) saveAllBtn.addEventListener('click', () => this.saveAll());
        const genCampaignBtn = $('#generateCampaignBtn');
        if (genCampaignBtn) genCampaignBtn.addEventListener('click', () => {
            this.generateCampaign().catch((err) => {
                console.error(err);
                UIManager.toast('캠페인 생성 중 오류가 발생했습니다.', 'error');
            });
        });
        const genCampaignResetBtn = $('#resetCampaignBtn');
        if (genCampaignResetBtn) genCampaignResetBtn.addEventListener('click', () => this.resetCampaignOptions());

        $('#genShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        $('#genStrategySelect')?.addEventListener('change', () => this.syncLegacyTogglesFromStrategy());
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
                    const targetDrawNo = this.readNumberInput('genTargetDrawNo', (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1);
                    const result = this.saveGeneratedEntryToTicket(entry, targetDrawNo)
                        || this.app.data.addTicket(nums, {
                            source: 'generator',
                            targetDrawNo,
                            strategyRequest: request
                        });
                    if (!result?.ticket) {
                        UIManager.toast('티켓북 추가에 실패했습니다.', 'error');
                    } else {
                        UIManager.toast(
                            result.incremented
                                ? `${targetDrawNo}회차 동일 티켓 수량을 x${result.quantity}로 늘렸습니다.`
                                : `${targetDrawNo}회차 티켓북에 추가했습니다.`,
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
    },

    resetCampaignOptions(force = true) {
        const defaults = {
            genTargetDrawNo: (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1,
            campStartDraw: (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1,
            campWeeks: 4,
            campSetsPerWeek: 3
        };
        const targetDrawIds = ['genTargetDrawNo', 'campStartDraw'];

        targetDrawIds.forEach((id) => {
            const el = $(`#${id}`);
            if (!el) return;
            if (!force && String(el.value || '').trim()) return;

            if (typeof this.app?.setTargetDrawInputValue === 'function') {
                this.app.setTargetDrawInputValue(id, defaults[id], { force: true, userEdited: false });
                return;
            }
            el.value = defaults[id];
        });

        ['campWeeks', 'campSetsPerWeek'].forEach((id) => {
            const el = $(`#${id}`);
            if (!el) return;
            if (force || !String(el.value || '').trim()) el.value = defaults[id];
        });
    },

    resetOptions() {
        $('#setCount').value = 5;
        $('#fixedNums').value = '';
        $('#excludeNums').value = '';
        $('#limitConsecutive').checked = true;
        $('#smartMode').checked = true;
        $('#preferHot').checked = true;
        $('#balanceMode').checked = true;
        const map = {
            genSimulationCount: 5000,
            genLookbackWindow: 20,
            genSeed: '',
            genOddMin: '',
            genOddMax: '',
            genHighMin: '',
            genHighMax: '',
            genSumMin: '',
            genSumMax: '',
            genAcMin: '',
            genAcMax: '',
            genMaxConsecutive: '',
            genEndDigitUnique: ''
        };
        Object.entries(map).forEach(([id, v]) => {
            const el = $(`#${id}`);
            if (el) el.value = v;
        });
        if ($('#genStrategySelect')) $('#genStrategySelect').value = 'ensemble_weighted';
        this.syncLegacyTogglesFromStrategy();
        this.data.setStrategyPrefs('generator', this.getStrategyRequestFromUI());
        this.data.save();
        UIManager.toast('옵션이 초기화되었습니다.');
    },

    populateStrategySelect() {
        const select = $('#genStrategySelect');
        if (!select) return;
        const current = select.value || 'ensemble_weighted';
        const includeExperimental = Boolean($('#genShowExperimental')?.checked);
        const items = listStrategies({ includeExperimental, scope: 'generator' });
        select.innerHTML = '';
        items.forEach((item) => {
            const opt = document.createElement('option');
            const exp = item.experimental ? ' [실험]' : '';
            opt.value = item.id;
            opt.textContent = `${item.label} (등급 ${item.tier})${exp}`;
            select.appendChild(opt);
        });
        const resolved = resolveStrategyId(current);
        if ([...select.options].some((x) => x.value === resolved)) {
            select.value = resolved;
        }
        this.syncLegacyTogglesFromStrategy();
    },

    syncLegacyTogglesFromStrategy() {
        const strategyId = resolveStrategyId($('#genStrategySelect')?.value || 'ensemble_weighted');
        const smart = $('#smartMode');
        const hot = $('#preferHot');
        const balance = $('#balanceMode');
        if (!smart || !hot || !balance) return;
        if (strategyId === 'random_baseline') {
            smart.checked = false;
            hot.checked = true;
            balance.checked = false;
            return;
        }
        smart.checked = true;
        hot.checked = strategyId !== 'cold_frequency';
        balance.checked = strategyId === 'balance_oe_hl' || strategyId === 'stat_ac_sum';
    },

    syncStrategyFromLegacyToggles() {
        const select = $('#genStrategySelect');
        if (!select) return;
        const smart = Boolean($('#smartMode')?.checked);
        const hot = Boolean($('#preferHot')?.checked);
        const balance = Boolean($('#balanceMode')?.checked);
        let strategyId = 'ensemble_weighted';
        if (!smart) strategyId = 'random_baseline';
        else if (balance) strategyId = 'balance_oe_hl';
        else if (!hot) strategyId = 'cold_frequency';
        else strategyId = 'hot_frequency';

        if ([...select.options].some((x) => x.value === strategyId)) {
            select.value = strategyId;
        }
    },

    readNumberInput(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const v = String(el.value || '').trim();
        if (!v) return fallback;
        const n = Number(v);
        if (!Number.isFinite(n)) return fallback;
        return n;
    },

    isWorkerTimeoutError(err) {
        return String(err?.message || '').includes('WORKER_TIMEOUT');
    },

    buildRange(minId, maxId) {
        const min = this.readNumberInput(minId, null);
        const max = this.readNumberInput(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    },

    getStrategyRequestFromUI() {
        const strategyId = resolveStrategyId($('#genStrategySelect')?.value || 'ensemble_weighted');
        const params = {
            simulationCount: this.readNumberInput('genSimulationCount', 5000),
            lookbackWindow: this.readNumberInput('genLookbackWindow', 20),
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: this.readNumberInput('genSeed', null)
        };

        const filters = {
            oddEven: this.buildRange('genOddMin', 'genOddMax'),
            highLow: this.buildRange('genHighMin', 'genHighMax'),
            sumRange: this.buildRange('genSumMin', 'genSumMax'),
            acRange: this.buildRange('genAcMin', 'genAcMax'),
            maxConsecutivePairs: this.readNumberInput('genMaxConsecutive', null),
            endDigitUniqueMin: this.readNumberInput('genEndDigitUnique', null)
        };

        return { strategyId, params, filters };
    },

    applyStrategyRequest(saved) {
        if (!saved) return;
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el && value !== undefined && value !== null) el.value = value;
        };
        assign('genSimulationCount', saved.params?.simulationCount);
        assign('genLookbackWindow', saved.params?.lookbackWindow);
        assign('genSeed', saved.params?.seed ?? '');

        const setPair = (minId, maxId, pair) => {
            const minEl = $(`#${minId}`);
            const maxEl = $(`#${maxId}`);
            if (!minEl || !maxEl) return;
            if (Array.isArray(pair) && pair.length >= 2) {
                minEl.value = pair[0];
                maxEl.value = pair[1];
            }
        };
        setPair('genOddMin', 'genOddMax', saved.filters?.oddEven);
        setPair('genHighMin', 'genHighMax', saved.filters?.highLow);
        setPair('genSumMin', 'genSumMax', saved.filters?.sumRange);
        setPair('genAcMin', 'genAcMax', saved.filters?.acRange);
        assign('genMaxConsecutive', saved.filters?.maxConsecutivePairs);
        assign('genEndDigitUnique', saved.filters?.endDigitUniqueMin);

        const strategyId = resolveStrategyId(saved.strategyId || 'ensemble_weighted');
        const select = $('#genStrategySelect');
        if (select && [...select.options].some((x) => x.value === strategyId)) {
            select.value = strategyId;
        }
        this.syncLegacyTogglesFromStrategy();
    },

    applySavedStrategyPrefs() {
        this.applyStrategyRequest(this.data.state.strategyPrefs?.generator);
    },

    parseInput(val) {
        return [...new Set(val.split(/[^0-9]+/).filter(Boolean).map(Number).filter(n => n >= 1 && n <= 45))];
    }
};
