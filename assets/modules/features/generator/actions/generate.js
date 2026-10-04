import { CONFIG } from '../../../utils/config.js';
import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { StrategyEngine } from '../../../core/StrategyEngine.js';
import { createRuntimeRng, withRuntimeSeed } from '../../../core/strategy/runtimeEntropy.js';
import { endMark, startMark } from '../../../utils/perf.js';
import { UI_STRINGS } from '../../../utils/strings.js';
import { upsertReproductionCodeBar } from '../../../utils/reproductionCode.js';
import { revealResults } from '../../../utils/dom.js';

function clampGeneratorSetCount(value, fallback = 5) {
    const number = Number(value);
    const next = Math.floor(Number.isFinite(number) ? number : fallback);
    return Math.min(CONFIG.LIMITS.MAX_SET, Math.max(1, next));
}

export const generatorActionGenerateMethods = {
    async generate() {
        if (this.isGenerating || this.isGeneratingCampaign) return false;
        startMark('generator.generate');
        const setCountEl = $('#setCount');
        const requested = clampGeneratorSetCount(setCountEl?.value);
        if (setCountEl) setCountEl.value = String(requested);
        let produced = 0;
        if (!Number.isFinite(this.generationToken)) this.generationToken = 0;
        const localToken = ++this.generationToken;
        const uiStrings = this.uiStrings || UI_STRINGS.generator;
        this.isGenerating = true;
        this.syncBusyButtons?.();
        try {
            if (!Array.isArray(this.data.state.winningStats) || !this.data.state.winningStats.length) {
                UIManager.toast(uiStrings.dataUnavailable || '당첨 데이터가 없습니다. 데이터 파일을 확인해주세요.', 'error', 3000);
                return false;
            }

            const fixed = this.parseInput($('#fixedNums').value);
            const exclude = this.parseInput($('#excludeNums').value);

            if (fixed.length > CONFIG.LIMITS.MAX_FIXED) {
                UIManager.toast(`꼭 넣을 번호는 최대 ${CONFIG.LIMITS.MAX_FIXED}개까지 정할 수 있어요.`, 'error');
                return false;
            }
            const overlap = fixed.filter((n) => exclude.includes(n));
            if (overlap.length) {
                UIManager.toast(`${overlap.join(', ')}번이 '꼭 넣을 번호'와 '뺄 번호'에 모두 들어 있어요.`, 'error', 3500);
                return false;
            }
            if (45 - exclude.length < 6) {
                UIManager.toast('뺄 번호가 너무 많아요. 최소 6개 번호는 남겨 주세요.', 'error');
                return false;
            }

            const request = this.getStrategyRequestFromUI();
            if ($('#limitConsecutive')?.checked) {
                request.filters.maxConsecutivePairs = request.filters.maxConsecutivePairs ?? 1;
            }
            this.data.setStrategyPrefs('generator', request);
            this.data.save();

            const listEl = $('#genResultList');
            listEl?.setAttribute('aria-busy', 'true');
            listEl.innerHTML = '';
            this.data.setGeneratedEntries([]);
            this.engine = new StrategyEngine(this.data.state.winningStats);

            let sets = [];
            let fallback = false;
            const createdAt = new Date().toISOString();
            const workerPayload = withRuntimeSeed({
                statsData: this.data.state.winningStats,
                count: requested,
                request,
                fixed,
                exclude,
                maxAttempts: 300
            });
            startMark('generator.worker');
            try {
                const result = await this.workerClient.generate(workerPayload);
                sets = Array.isArray(result?.sets) ? result.sets : [];
            } catch (err) {
                fallback = true;
                if (this.isWorkerTimeoutError(err)) {
                    UIManager.toast(uiStrings.workerFallback, 'warning');
                }
                console.warn('전략 워커 사용 실패, 메인 스레드로 대체합니다.', err);
                const runtimeRng = createRuntimeRng(request, workerPayload.runtimeSeed);
                sets = this.engine.generateMultipleSets(requested, request, {
                    fixed,
                    exclude,
                    maxAttempts: 300,
                    maxCount: CONFIG.LIMITS.MAX_SET,
                    ...(runtimeRng ? { rng: runtimeRng } : {})
                });
            } finally {
                endMark('generator.worker', { count: sets.length, requested, fallback });
            }

            if (localToken !== this.generationToken) return false;
            this.lastRuntimeSeed = workerPayload.runtimeSeed ?? null;
            const genPanel = listEl?.parentElement;
            upsertReproductionCodeBar({
                host: genPanel,
                barId: 'genReproductionCode',
                seed: this.lastRuntimeSeed,
                request
            });
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
            this.renderTemporaryResultNotice?.();
            revealResults(genPanel);
            produced = sets.length;
            if (produced < requested) {
                UIManager.toast(
                    `조건에 맞는 조합이 ${produced}/${requested}개뿐이에요. 조건을 조금 넓혀 보세요.`,
                    'warning',
                    3500
                );
            }
        } finally {
            $('#genResultList')?.setAttribute('aria-busy', 'false');
            if (localToken === this.generationToken) {
                this.isGenerating = false;
                this.syncBusyButtons?.();
            }
            endMark('generator.generate', { count: produced, requested });
        }
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
        UIManager.toast(`${nextEntries.length}개 조합을 생성 기록에 저장했어요.`, 'success');
        if (this.app.renderDataLists) this.app.renderDataLists();
    }
};