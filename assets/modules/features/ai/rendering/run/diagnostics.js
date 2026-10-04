import { UIManager } from '../../../../core/UIManager.js';
import { UI_STRINGS } from '../../../../utils/strings.js';
import { formatAdaptiveSelection } from '../formatters.js';

export function logAiDiagnostics(ctx, { log, request, targetSetCount, results, result, explanations, workerTimedOut }) {
    const diagnostics = result?.simulation?.diagnostics || {};
    const accepted = Number(diagnostics.accepted || 0);
    const simulationCount = Number(diagnostics.simulationCount || request.params.simulationCount || 0);
    const executionMode = diagnostics.executionMode || 'worker';
    const fallbackMode = diagnostics.fallbackMode || 'none';

    if (results.length < targetSetCount) {
        ctx.appendLog(
            log,
            `> 완료! 조건에 맞는 조합 ${results.length}/${targetSetCount}개를 찾았어요.`,
            'var(--warning)'
        );
        UIManager.toast(`세부 조건에 맞는 조합이 ${results.length}/${targetSetCount}개뿐이에요. 조건을 조금 넓혀 보세요.`, 'warning', 3500);
    } else {
        ctx.appendLog(log, `> 완료! 추천 조합 ${results.length}개를 만들었어요.`, 'var(--success)');
    }

    if (executionMode === 'main_thread' && workerTimedOut) {
        ctx.appendLog(log, '> 계산이 오래 걸려 다른 방법으로 마무리했어요.');
    }
    ctx.appendLog(log, `> 조건을 통과한 후보: ${accepted.toLocaleString()} / ${simulationCount.toLocaleString()}개`);
    if (fallbackMode === 'uniform_weights') {
        ctx.appendLog(log, `> ${UI_STRINGS.ai.uniformFallback}`, 'var(--warning)');
        UIManager.toast(UI_STRINGS.ai.uniformFallback, 'warning');
    }

    const adaptive = diagnostics.adaptive || explanations[0]?.adaptive || null;
    if (adaptive?.evaluationWindow) {
        ctx.appendLog(log, `> 자동 선택을 위해 최근 ${adaptive.evaluationWindow}회 성적을 비교했어요.`);
    }
    const adaptiveSelection = formatAdaptiveSelection(adaptive);
    if (adaptiveSelection) {
        ctx.appendLog(log, `> 자동으로 고른 방식: ${adaptiveSelection}`);
    }

    const candidatePool = Number(diagnostics.uniqueCandidates || 0);
    if (candidatePool > 0) {
        ctx.appendLog(log, `> 최종 비교한 후보 조합: ${candidatePool}개`);
    }
    const topScore = Number(diagnostics.topScore || 0);
    if (topScore > 0) {
        ctx.appendLog(log, `> 가장 높은 내부 랭킹 점수: ${topScore.toFixed(3)}`);
    }
}