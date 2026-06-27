import { $ } from '../../../../utils/utils.js';
import { UIManager } from '../../../../core/UIManager.js';
import { getStrategyMeta } from '../../../../core/StrategyCatalog.js';
import { withRuntimeSeed } from '../../../../core/strategy/runtimeEntropy.js';
import { endMark, startMark } from '../../../../utils/perf.js';
import { executeAiRecommendation, ensureAiExplanations } from './workerExecution.js';
import { logAiDiagnostics } from './diagnostics.js';

export const aiRenderingRunMethods = {
    async run() {
        const btn = $('#aiPredictBtn');
        const out = $('#aiOutput');
        const log = $('#aiLogArea');
        const aiContainer = $('#page-ai .ai-container');

        if (!this.app.data.state.winningStats.length) {
            UIManager.toast('당첨 데이터가 없습니다. 데이터 파일을 확인해주세요.', 'error', 3000);
            return;
        }
        if (this.isRecommending) return;

        if (!Number.isFinite(this.runToken)) this.runToken = 0;
        const localToken = ++this.runToken;
        this.isRecommending = true;

        startMark('ai.run');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 분석 중...';
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
        const selectedModelName = getStrategyMeta(request.strategyId).label || '선택 전략';

        const logs = [
            `선택 모델: ${selectedModelName}`,
            '빈도, 최근성, 출현 간격 신호를 분석합니다...',
            '전략 가중치를 반영합니다...',
            `몬테카를로를 실행합니다(${request.params.simulationCount.toLocaleString()}회 샘플)...`,
            '최적 후보 조합을 추출합니다...'
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
        } catch (e) {
            console.error('인공지능 분석 오류:', e);
            if (e?.userFacingHandled) return;
            this.appendLog(log, `> 오류: ${e.message}`, 'var(--danger)');
            UIManager.toast('분석 중 오류가 발생했습니다.', 'error');
        } finally {
            if (localToken === this.runToken) {
                this.isRecommending = false;
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="ph-bold ph-brain"></i> 다시 추천';
                }
                out?.setAttribute('aria-busy', 'false');
                aiContainer?.classList.remove('fx-active');
            }
            endMark('ai.run', { strategyId: request?.strategyId });
        }
    }
};