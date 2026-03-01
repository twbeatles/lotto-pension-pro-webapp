import { CONFIG } from '../utils/config.js';
import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { StrategyEngine } from '../core/StrategyEngine.js';
import { listStrategies, resolveStrategyId } from '../core/StrategyCatalog.js';
import { endMark, startMark } from '../utils/perf.js';
import { StrategyWorkerClient } from '../core/StrategyWorkerClient.js';

export class GeneratorModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.engine = new StrategyEngine(this.data.state.winningStats);
        this.workerClient = this.app.strategyWorker || new StrategyWorkerClient();
        this.boundDelegation = false;
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
        this.resetCampaignOptions(false);
    }

    bindEvents() {
        const btn = $('#generateBtn');
        if (btn) btn.addEventListener('click', () => {
            this.generate().catch((err) => {
                console.error(err);
                UIManager.toast('踰덊샇 ?앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.', 'error');
            });
        });

        const resetBtn = $('#resetOptions');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetOptions());

        const clearBtn = $('#clearResults');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            $('#genResultList').innerHTML = '';
            this.data.state.generated = [];
        });

        const saveAllBtn = $('#saveAllBtn');
        if (saveAllBtn) saveAllBtn.addEventListener('click', () => this.saveAll());
        const genCampaignBtn = $('#generateCampaignBtn');
        if (genCampaignBtn) genCampaignBtn.addEventListener('click', () => {
            this.generateCampaign().catch((err) => {
                console.error(err);
                UIManager.toast('罹좏럹???앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.', 'error');
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
                if (action === 'ticket') {
                    const request = this.getStrategyRequestFromUI();
                    const targetDrawNo = this.readNumberInput('genTargetDrawNo', (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1);
                    const added = this.app.data.addTicket(nums, {
                        source: 'generator',
                        targetDrawNo,
                        strategyRequest: request
                    });
                    if (!added) {
                        UIManager.toast('?대? ?곗폆遺곸뿉 ?덈뒗 踰덊샇?낅땲??', 'warning');
                    } else {
                        UIManager.toast(`${targetDrawNo}?뚯감 ?곗폆遺곸뿉 異붽??섏뿀?듬땲??`, 'success');
                        if (this.app.renderDataLists) this.app.renderDataLists();
                    }
                    return;
                }
                if (action === 'share') {
                    const originalHTML = btn.innerHTML;
                    try {
                        btn.disabled = true;
                        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
                        await UIManager.saveAsImage(itemEl, `濡쒕삉_?앹꽦_${idx + 1}.png`);
                    } catch (err) {
                        console.error(err);
                        UIManager.toast('?대?吏 ????ㅽ뙣', 'error');
                    } finally {
                        btn.disabled = false;
                        btn.innerHTML = originalHTML;
                    }
                }
            });
            this.boundDelegation = true;
        }
    }

    resetCampaignOptions(force = true) {
        const defaults = {
            genTargetDrawNo: (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1,
            campStartDraw: (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1,
            campWeeks: 4,
            campSetsPerWeek: 3
        };
        Object.entries(defaults).forEach(([id, v]) => {
            const el = $(`#${id}`);
            if (!el) return;
            if (force || !String(el.value || '').trim()) el.value = v;
        });
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
        UIManager.toast('?듭뀡??珥덇린?붾릺?덉뒿?덈떎.');
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
            const exp = item.experimental ? ' [?ㅽ뿕]' : '';
            opt.value = item.id;
            opt.textContent = `${item.label} (?깃툒 ${item.tier})${exp}`;
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

    isWorkerTimeoutError(err) {
        return String(err?.message || '').includes('WORKER_TIMEOUT');
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

    async generate() {
        startMark('generator.generate');
        let requested = Number($('#setCount').value) || 5;
        let produced = 0;
        try {
            const fixed = this.parseInput($('#fixedNums').value);
            const exclude = this.parseInput($('#excludeNums').value);

            if (fixed.length > CONFIG.LIMITS.MAX_FIXED) {
                UIManager.toast(`怨좎젙?섎뒗 理쒕? ${CONFIG.LIMITS.MAX_FIXED}媛쒖엯?덈떎.`, 'error');
                return;
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

            let sets = [];
            let fallback = false;
            startMark('generator.worker');
            try {
                const result = await this.workerClient.generate({
                    statsData: this.data.state.winningStats,
                    count: requested,
                    request,
                    fixed,
                    exclude,
                    maxAttempts: 300
                });
                sets = Array.isArray(result?.sets) ? result.sets : [];
            } catch (err) {
                fallback = true;
                if (this.isWorkerTimeoutError(err)) {
                    UIManager.toast('Worker timeout. Falling back to main-thread generation.', 'warning');
                }
                console.warn('?꾨왂 ?뚯빱 ?ъ슜 ?ㅽ뙣, 硫붿씤 ?ㅻ젅?쒕줈 ?泥댄빀?덈떎.', err);
                sets = this.engine.generateMultipleSets(requested, request, { fixed, exclude, maxAttempts: 300 });
            } finally {
                endMark('generator.worker', { count: sets.length, requested, fallback });
            }

            sets.forEach((nums, i) => {
                this.data.state.generated.push(nums);
                this.renderResultItem(nums, i, listEl);
            });
            produced = sets.length;
        } finally {
            endMark('generator.generate', { count: produced, requested });
        }
    }

    async generateCampaign() {
        startMark('generator.campaign');
        let inserted = 0;
        let totalCreated = 0;
        let weeks = 0;
        let setsPerWeek = 0;
        let fallbackRuns = 0;

        try {
            const startDraw = Math.max(1, Math.floor(this.readNumberInput('campStartDraw', (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1)));
            weeks = Math.max(1, Math.floor(this.readNumberInput('campWeeks', 4)));
            setsPerWeek = Math.max(1, Math.floor(this.readNumberInput('campSetsPerWeek', 3)));
            const fixed = this.parseInput($('#fixedNums').value);
            const exclude = this.parseInput($('#excludeNums').value);
            const request = this.getStrategyRequestFromUI();

            this.engine = new StrategyEngine(this.data.state.winningStats);

            const tickets = [];
            for (let i = 0; i < weeks; i++) {
                const targetDrawNo = startDraw + i;
                let sets = [];
                let fallback = false;
                startMark('generator.worker');
                try {
                    const result = await this.workerClient.generate({
                        statsData: this.data.state.winningStats,
                        count: setsPerWeek,
                        request,
                        fixed,
                        exclude,
                        maxAttempts: Math.max(240, setsPerWeek * 120)
                    });
                    sets = Array.isArray(result?.sets) ? result.sets : [];
                } catch (err) {
                    fallback = true;
                    fallbackRuns++;
                    if (this.isWorkerTimeoutError(err)) {
                        UIManager.toast('Worker timeout in campaign mode. Falling back to main-thread.', 'warning');
                    }
                    console.warn('罹좏럹???앹꽦 ?뚯빱 ?ㅽ뙣, 硫붿씤 ?ㅻ젅?쒕줈 ?泥댄빀?덈떎.', err);
                    sets = this.engine.generateMultipleSets(setsPerWeek, request, {
                        fixed,
                        exclude,
                        maxAttempts: Math.max(240, setsPerWeek * 120)
                    });
                } finally {
                    endMark('generator.worker', {
                        count: sets.length,
                        requested: setsPerWeek,
                        fallback,
                        campaign: true
                    });
                }

                sets.forEach((numbers) => {
                    tickets.push({
                        id: this.data.createId('ticket'),
                        numbers,
                        targetDrawNo,
                        source: 'generator',
                        strategyRequest: request,
                        memo: `罹좏럹??${startDraw}-${startDraw + weeks - 1}`,
                        createdAt: new Date().toISOString(),
                        checked: null
                    });
                    totalCreated++;
                });
            }

            inserted = this.data.addTicketsBulk(tickets, { silent: true });
            const campaign = this.data.addCampaign({
                name: `${startDraw}회 시작 ${weeks}주`,
                startDrawNo: startDraw,
                weeks,
                setsPerWeek,
                strategyRequest: request
            });
            this.data.save();

            UIManager.toast(`罹좏럹???앹꽦 ?꾨즺: ${inserted}/${totalCreated}媛??곗폆 異붽?`, inserted > 0 ? 'success' : 'warning');
            if (campaign && this.app.renderDataLists) this.app.renderDataLists();
        } finally {
            endMark('generator.campaign', { inserted, totalCreated, weeks, setsPerWeek, fallbackRuns });
        }
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
                <button class="icon-btn" data-action="copy" aria-label="踰덊샇 蹂듭궗" title="蹂듭궗"><i class="ph ph-copy"></i></button>
                <button class="icon-btn" data-action="qr" aria-label="?먯븣 肄붾뱶 蹂닿린" title="?먯븣"><i class="ph ph-qr-code"></i></button>
                <button class="icon-btn" data-action="ticket" aria-label="?곗폆遺?異붽?" title="?곗폆遺?><i class="ph ph-ticket"></i></button>
                <button class="icon-btn" data-action="share" aria-label="?대?吏 ??? title="?대?吏 ???><i class="ph ph-download-simple"></i></button>
                <button class="icon-btn" data-action="fav" aria-label="利먭꺼李얘린 異붽?" title="利먭꺼李얘린"><i class="ph ph-star"></i></button>
            </div>
        `;

        // CSS animation delay avoids one timer per row during bulk rendering.
        el.classList.add('enter-animate');
        el.style.setProperty('--enter-delay', `${Math.min(index, 20) * 60}ms`);

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
        this.data.markDirty?.('hist');
        this.data.save();
        UIManager.toast(`${count}媛??명듃 ?덉뒪?좊━ ????꾨즺`, 'success');
        if (this.app.renderDataLists) this.app.renderDataLists();
    }
}

