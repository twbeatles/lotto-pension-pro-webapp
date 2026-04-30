import { CONFIG } from '../../utils/config.js';
import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { StrategyEngine } from '../../core/StrategyEngine.js';
import { endMark, startMark } from '../../utils/perf.js';
import { UI_STRINGS } from '../../utils/strings.js';

function deriveCampaignRuntimeRequest(baseRequest, weekIndex = 0) {
    const normalizedWeekIndex = Math.max(0, Math.floor(Number(weekIndex) || 0));
    const baseSeed = baseRequest?.params?.seed;
    const hasSeed = baseSeed !== null && baseSeed !== undefined && baseSeed !== '' && Number.isFinite(Number(baseSeed));

    return {
        ...baseRequest,
        params: {
            ...(baseRequest?.params || {}),
            seed: hasSeed ? Math.floor(Number(baseSeed)) + normalizedWeekIndex : null
        }
    };
}

export const generatorActionMethods = {
    getGeneratedEntry(index) {
        return this.data.getGeneratedEntries()[Number(index)] || null;
    },

    saveGeneratedEntryToTicket(entry, targetDrawNo) {
        const generatedEntry = this.data.normalizeGeneratedEntry(entry, { source: 'generator' });
        if (!generatedEntry) return null;
        return this.app.data.addTicket(generatedEntry.numbers, {
            source: generatedEntry.source || 'generator',
            targetDrawNo,
            strategyRequest: generatedEntry.strategyRequest || this.getStrategyRequestFromUI()
        });
    },

    getCampaignRuntimeRequest(baseRequest, weekIndex = 0) {
        return deriveCampaignRuntimeRequest(baseRequest, weekIndex);
    },

    async generate() {
        if (this.isGenerating || this.isGeneratingCampaign) return false;
        startMark('generator.generate');
        let requested = Number($('#setCount').value) || 5;
        let produced = 0;
        if (!Number.isFinite(this.generationToken)) this.generationToken = 0;
        const localToken = ++this.generationToken;
        const uiStrings = this.uiStrings || UI_STRINGS.generator;
        this.isGenerating = true;
        this.syncBusyButtons?.();
        try {
            const fixed = this.parseInput($('#fixedNums').value);
            const exclude = this.parseInput($('#excludeNums').value);

            if (fixed.length > CONFIG.LIMITS.MAX_FIXED) {
                UIManager.toast(`고정수는 최대 ${CONFIG.LIMITS.MAX_FIXED}개입니다.`, 'error');
                return;
            }

            const request = this.getStrategyRequestFromUI();
            if ($('#limitConsecutive')?.checked) {
                request.filters.maxConsecutivePairs = request.filters.maxConsecutivePairs ?? 1;
            }
            this.data.setStrategyPrefs('generator', request);
            this.data.save();

            const listEl = $('#genResultList');
            listEl.innerHTML = '';
            this.data.setGeneratedEntries([]);
            this.engine = new StrategyEngine(this.data.state.winningStats);

            let sets = [];
            let fallback = false;
            const createdAt = new Date().toISOString();
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
                    UIManager.toast(uiStrings.workerFallback, 'warning');
                }
                console.warn('전략 워커 사용 실패, 메인 스레드로 대체합니다.', err);
                sets = this.engine.generateMultipleSets(requested, request, { fixed, exclude, maxAttempts: 300 });
            } finally {
                endMark('generator.worker', { count: sets.length, requested, fallback });
            }

            if (localToken !== this.generationToken) return false;
            const generatedEntries = this.data.setGeneratedEntries(
                sets.map((numbers) => ({
                    numbers,
                    strategyRequest: request,
                    createdAt,
                    source: 'generator'
                }))
            );
            generatedEntries.forEach((entry, i) => {
                this.renderResultItem(entry.numbers, i, listEl);
            });
            produced = sets.length;
            if (produced < requested) {
                UIManager.toast(
                    `필터 조건으로 ${produced}/${requested}개만 생성되었습니다. 조건을 완화해보세요.`,
                    'warning',
                    3500
                );
            }
        } finally {
            if (localToken === this.generationToken) {
                this.isGenerating = false;
                this.syncBusyButtons?.();
            }
            endMark('generator.generate', { count: produced, requested });
        }
    },

    async generateCampaign() {
        if (this.isGenerating || this.isGeneratingCampaign) return false;
        startMark('generator.campaign');
        let inserted = 0;
        let totalCreated = 0;
        let weeks = 0;
        let setsPerWeek = 0;
        let requestedTotal = 0;
        let fallbackRuns = 0;
        if (!Number.isFinite(this.campaignToken)) this.campaignToken = 0;
        const localToken = ++this.campaignToken;
        const uiStrings = this.uiStrings || UI_STRINGS.generator;
        this.isGeneratingCampaign = true;
        this.syncBusyButtons?.();

        try {
            const startDraw = Math.max(
                1,
                Math.floor(
                    this.readNumberInput('campStartDraw', (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1)
                )
            );
            weeks = Math.max(1, Math.floor(this.readNumberInput('campWeeks', 4)));
            setsPerWeek = Math.max(1, Math.floor(this.readNumberInput('campSetsPerWeek', 3)));
            requestedTotal = weeks * setsPerWeek;
            const fixed = this.parseInput($('#fixedNums').value);
            const exclude = this.parseInput($('#excludeNums').value);
            const request = this.getStrategyRequestFromUI();

            if (fixed.length > CONFIG.LIMITS.MAX_FIXED) {
                UIManager.toast(`고정수는 최대 ${CONFIG.LIMITS.MAX_FIXED}개입니다.`, 'error');
                return;
            }
            if (weeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) {
                UIManager.toast(`캠페인 주차 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS}주입니다.`, 'warning');
                return;
            }
            if (setsPerWeek > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) {
                UIManager.toast(
                    `주당 세트 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK}세트입니다.`,
                    'warning'
                );
                return;
            }
            if (requestedTotal > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) {
                UIManager.toast(
                    `캠페인 총 티켓 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS}개입니다.`,
                    'warning'
                );
                return;
            }

            this.engine = new StrategyEngine(this.data.state.winningStats);

            const tickets = [];
            const campaignId = this.data.createId('campaign');
            for (let i = 0; i < weeks; i++) {
                const targetDrawNo = startDraw + i;
                const runtimeRequest = deriveCampaignRuntimeRequest(request, i);
                let sets = [];
                let fallback = false;
                startMark('generator.worker');
                try {
                    const result = await this.workerClient.generate({
                        statsData: this.data.state.winningStats,
                        count: setsPerWeek,
                        request: runtimeRequest,
                        fixed,
                        exclude,
                        maxAttempts: Math.max(240, setsPerWeek * 120)
                    });
                    sets = Array.isArray(result?.sets) ? result.sets : [];
                } catch (err) {
                    fallback = true;
                    fallbackRuns++;
                    if (this.isWorkerTimeoutError(err)) {
                        UIManager.toast(uiStrings.workerFallbackCampaign, 'warning');
                    }
                    console.warn('캠페인 생성 워커 실패, 메인 스레드로 대체합니다.', err);
                    sets = this.engine.generateMultipleSets(setsPerWeek, runtimeRequest, {
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
                        campaignId,
                        strategyRequest: runtimeRequest,
                        memo: `캠페인 ${startDraw}-${startDraw + weeks - 1}`,
                        createdAt: new Date().toISOString(),
                        checked: null
                    });
                    totalCreated++;
                });
            }

            if (localToken !== this.campaignToken) return false;
            const bulkResult = this.data.addTicketsBulk(tickets, { silent: true });
            inserted = bulkResult.addedQuantity;
            let campaign = null;
            if (bulkResult.insertedRows > 0) {
                campaign = this.data.addCampaign({
                    id: campaignId,
                    name: `${startDraw}회 시작 ${weeks}주`,
                    startDrawNo: startDraw,
                    weeks,
                    setsPerWeek,
                    strategyRequest: request
                });
            }
            this.data.save();

            if (totalCreated < requestedTotal) {
                UIManager.toast(`필터 조건으로 ${totalCreated}/${requestedTotal}개만 생성되었습니다.`, 'warning', 3500);
            }
            if (inserted > 0) {
                UIManager.toast(
                    `캠페인 생성 완료: 티켓 ${inserted}개 반영${bulkResult.insertedRows !== inserted ? ` (${bulkResult.insertedRows}개 조합)` : ''}`,
                    'success'
                );
            } else if (totalCreated > 0) {
                UIManager.toast('생성된 티켓이 모두 중복되어 캠페인을 저장하지 않았습니다.', 'warning', 3500);
            } else {
                UIManager.toast('생성된 티켓이 없어 캠페인을 저장하지 않았습니다.', 'warning', 3500);
            }
            if (campaign && this.app.renderDataLists) this.app.renderDataLists();
        } finally {
            if (localToken === this.campaignToken) {
                this.isGeneratingCampaign = false;
                this.syncBusyButtons?.();
            }
            endMark('generator.campaign', { inserted, totalCreated, requestedTotal, weeks, setsPerWeek, fallbackRuns });
        }
    },

    renderResultItem(nums, index, container) {
        const el = document.createElement('div');
        el.className = 'result-item';
        el.dataset.idx = String(index);
        el.innerHTML = `
            <div class="result-balls ball-container">${UIManager.renderBalls(nums)}</div>
            <div class="result-actions">
                <button class="icon-btn" data-action="copy" aria-label="번호 복사" title="복사"><i class="ph ph-copy"></i></button>
                <button class="icon-btn" data-action="qr" aria-label="큐알 코드 보기" title="큐알"><i class="ph ph-qr-code"></i></button>
                <button class="icon-btn" data-action="ticket" aria-label="티켓북 추가" title="티켓북"><i class="ph ph-ticket"></i></button>
                <button class="icon-btn" data-action="share" aria-label="이미지 저장" title="이미지 저장"><i class="ph ph-download-simple"></i></button>
                <button class="icon-btn" data-action="fav" aria-label="즐겨찾기 추가" title="즐겨찾기"><i class="ph ph-star"></i></button>
            </div>
        `;

        // CSS animation delay avoids one timer per row during bulk rendering.
        el.classList.add('enter-animate');
        el.style.setProperty('--enter-delay', `${Math.min(index, 20) * 60}ms`);

        container.appendChild(el);
    },

    saveAll() {
        const generatedEntries = this.data.getGeneratedEntries();
        if (!generatedEntries.length) return;
        const createdAt = new Date().toISOString();
        const nextEntries = generatedEntries.map((entry) => ({
            numbers: entry.numbers,
            date: createdAt
        }));
        this.data.state.history = this.data
            .mergeHistoryEntries(nextEntries, this.data.state.history)
            .slice(0, CONFIG.LIMITS.MAX_HIST);
        this.data.markDirty?.('hist');
        this.data.save();
        UIManager.toast(`${nextEntries.length}개 세트 히스토리 저장 완료`, 'success');
        if (this.app.renderDataLists) this.app.renderDataLists();
    }
};
