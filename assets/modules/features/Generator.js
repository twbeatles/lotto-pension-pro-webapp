import { CONFIG } from '../utils/config.js';
import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { StrategyEngine } from '../core/StrategyEngine.js';
import { listStrategies, resolveStrategyId } from '../core/StrategyCatalog.js';

export class GeneratorModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.engine = new StrategyEngine(this.data.state.winningStats);
        this.boundDelegation = false;
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
    }

    bindEvents() {
        const btn = $('#generateBtn');
        if (btn) btn.addEventListener('click', () => this.generate());

        const resetBtn = $('#resetOptions');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetOptions());

        const clearBtn = $('#clearResults');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            $('#genResultList').innerHTML = '';
            this.data.state.generated = [];
        });

        const saveAllBtn = $('#saveAllBtn');
        if (saveAllBtn) saveAllBtn.addEventListener('click', () => this.saveAll());

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
                const nums = this.data.state.generated[idx];
                if (!nums) return;

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
                if (action === 'share') {
                    const originalHTML = btn.innerHTML;
                    try {
                        btn.disabled = true;
                        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
                        await UIManager.saveAsImage(itemEl, `lotto_gen_${idx + 1}.png`);
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
    }

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
        this.data.setStrategyPrefs('generator', this.getStrategyRequestFromUI());
        this.data.save();
        UIManager.toast('옵션이 초기화되었습니다.');
    }

    populateStrategySelect() {
        const select = $('#genStrategySelect');
        if (!select) return;
        const current = select.value || 'ensemble_weighted';
        const includeExperimental = Boolean($('#genShowExperimental')?.checked);
        const items = listStrategies({ includeExperimental });
        select.innerHTML = '';
        items.forEach((item) => {
            const opt = document.createElement('option');
            const exp = item.experimental ? ' [실험]' : '';
            opt.value = item.id;
            opt.textContent = `${item.label} (Tier ${item.tier})${exp}`;
            select.appendChild(opt);
        });
        const resolved = resolveStrategyId(current);
        if ([...select.options].some((x) => x.value === resolved)) {
            select.value = resolved;
        }
        this.syncLegacyTogglesFromStrategy();
    }

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
    }

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
    }

    readNumberInput(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const v = String(el.value || '').trim();
        if (!v) return fallback;
        const n = Number(v);
        if (!Number.isFinite(n)) return fallback;
        return n;
    }

    buildRange(minId, maxId) {
        const min = this.readNumberInput(minId, null);
        const max = this.readNumberInput(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    }

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
    }

    applySavedStrategyPrefs() {
        const saved = this.data.state.strategyPrefs?.generator;
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
    }

    generate() {
        const count = Number($('#setCount').value) || 5;
        const fixed = this.parseInput($('#fixedNums').value);
        const exclude = this.parseInput($('#excludeNums').value);

        if (fixed.length > CONFIG.LIMITS.MAX_FIXED) {
            return UIManager.toast(`고정수는 최대 ${CONFIG.LIMITS.MAX_FIXED}개입니다.`, 'error');
        }

        this.syncStrategyFromLegacyToggles();
        const request = this.getStrategyRequestFromUI();
        this.data.setStrategyPrefs('generator', request);
        this.data.save();
        if ($('#limitConsecutive')?.checked) {
            request.filters.maxConsecutivePairs = request.filters.maxConsecutivePairs ?? 1;
        }

        const listEl = $('#genResultList');
        listEl.innerHTML = '';
        this.data.state.generated = [];
        this.engine = new StrategyEngine(this.data.state.winningStats);

        const sets = this.engine.generateMultipleSets(count, request, { fixed, exclude, maxAttempts: 300 });
        sets.forEach((nums, i) => {
            this.data.state.generated.push(nums);
            this.renderResultItem(nums, i, listEl);
        });
    }

    parseInput(val) {
        return [...new Set(val.split(/[^0-9]+/).filter(Boolean).map(Number).filter(n => n >= 1 && n <= 45))];
    }

    renderResultItem(nums, index, container) {
        const el = document.createElement('div');
        el.className = 'result-item';
        el.dataset.idx = String(index);
        el.innerHTML = `
            <div class="result-balls ball-container">${UIManager.renderBalls(nums)}</div>
            <div class="result-actions">
                <button class="icon-btn" data-action="copy" aria-label="번호 복사" title="복사"><i class="ph ph-copy"></i></button>
                <button class="icon-btn" data-action="qr" aria-label="QR 코드 보기" title="QR"><i class="ph ph-qr-code"></i></button>
                <button class="icon-btn" data-action="share" aria-label="이미지 저장" title="이미지 저장"><i class="ph ph-download-simple"></i></button>
                <button class="icon-btn" data-action="fav" aria-label="즐겨찾기 추가" title="즐겨찾기"><i class="ph ph-star"></i></button>
            </div>
        `;

        // Animation
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 80);

        container.appendChild(el);
    }

    saveAll() {
        if (!this.data.state.generated.length) return;
        let count = 0;
        this.data.state.generated.forEach(nums => {
            // Check History dupes
            const key = nums.join(',');
            if (!this.data.state.history.some(h => h.numbers.join(',') === key)) {
                this.data.state.history.unshift({ numbers: nums, date: new Date().toISOString() });
                count++;
            }
        });
        if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
            this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
        }
        this.data.save();
        UIManager.toast(`${count}개 세트 히스토리 저장 완료`, 'success');
        if (this.app.renderDataLists) this.app.renderDataLists();
    }
}
