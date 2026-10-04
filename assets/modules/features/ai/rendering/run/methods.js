import { $ } from '../../../../utils/utils.js';
import { UIManager } from '../../../../core/UIManager.js';
import { UI_STRINGS } from '../../../../utils/strings.js';
import { getStrategyMeta } from '../../../../core/StrategyCatalog.js';
import { withRuntimeSeed } from '../../../../core/strategy/runtimeEntropy.js';
import { endMark, startMark } from '../../../../utils/perf.js';
import { executeAiRecommendation, ensureAiExplanations } from './workerExecution.js';
import { logAiDiagnostics } from './diagnostics.js';
import { revealResults } from '../../../../utils/dom.js';

export const aiRenderingRunMethods = {
    async run() {
        const btn = $('#aiPredictBtn');
        const out = $('#aiOutput');
        const log = $('#aiLogArea');
        const aiContainer = $('#page-ai .ai-container');

        if (!this.app.data.state.winningStats.length) {
            UIManager.toast(UI_STRINGS.generator.dataUnavailable, 'error', 3000);
            return;
        }
        if (this.isRecommending) return;

        if (!Number.isFinite(this.runToken)) this.runToken = 0;
        const localToken = ++this.runToken;
        this.isRecommending = true;

        startMark('ai.run');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 번호 고르는 중...';
        }
        out.innerHTML = '';
        this.app.data.state.aiResults = [];
        this.app.data.persistTemporaryResultsToSession?.();
        out.setAttribute('aria-busy', 'true');
        log.innerHTML = '';
        aiContainer?.classList.add('fx-active');

        const request = this.buildStrategyRequest();
        this.app.data.save();
        const targetSetCount = 5;
        const selectedModelName = getStrategyMeta(request.strategyId).label || '선택한 방식';

        const logs = [
            `추천 방식: ${selectedModelName}`,
            '지난 당첨 번호에서 자주·최근·오래 쉰 번호를 살펴봅니다...',
            `후보 조합 ${request.params.simulationCount.toLocaleString()}개를 만들어 비교합니다...`,
            '점수가 높은 조합을 고르는 중...'
        ];

        try {
            logs.forEach((msg) => this.appendLog(log, `> ${msg}`));

            let result = null;
            let results = [];
            let explanations = [];
            let fallback = false;
            let workerTimedOut = false;
            startMark('ai.worker');
            const workerPayload = withRuntimeSeed({
                statsData: this.app.data.state.winningStats,
                request,
                setCount: targetSetCount
            });

            try {
                const execution = await executeAiRecommendation(this, {
                    request,
                    targetSetCount,
                    log,
                    workerPayload
                });
                result = execution.result;
                results = execution.results;
                explanations = execution.explanations;
                fallback = execution.fallback;
                workerTimedOut = execution.workerTimedOut;
            } finally {
                endMark('ai.worker', { requested: targetSetCount, count: results.length, fallback });
            }

            if (localToken !== this.runToken) return;

            if (!results || results.length === 0) {
                throw new Error('시뮬레이션 결과가 비어 있습니다');
            }
            if (!explanations.length) {
                explanations = ensureAiExplanations(this, { request, results, result });
            }

            logAiDiagnostics(this, {
                log,
                request,
                targetSetCount,
                results,
                result,
                explanations,
                workerTimedOut
            });

            if (localToken !== this.runToken) return;

            this.lastRuntimeSeed = workerPayload?.runtimeSeed ?? null;
            this.app.data.state.aiResults = results;
            this.app.data.persistTemporaryResultsToSession?.();
            this.lastRequest = request;
            this.lastExplain = explanations;
            this.renderResults(results, explanations, {
                runtimeSeed: this.lastRuntimeSeed,
                request
            });
            revealResults(out);
        } catch (e) {
            console.error('인공지능 분석 오류:', e);
            if (e?.userFacingHandled) return;
            this.appendLog(log, `> 오류: ${e.message}`, 'var(--danger)');
            UIManager.toast('추천 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 'error');
        } finally {
            if (localToken === this.runToken) {
                this.isRecommending = false;
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="ph-bold ph-sparkle"></i> 다시 추천받기';
                }
                out?.setAttribute('aria-busy', 'false');
                aiContainer?.classList.remove('fx-active');
            }
            endMark('ai.run', { strategyId: request?.strategyId });
        }
    }
};