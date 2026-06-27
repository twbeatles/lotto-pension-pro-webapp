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
            `> 분석 완료. 추천 조합 ${results.length}/${targetSetCount}개를 생성했습니다.`,
            'var(--warning)'
        );
        UIManager.toast(`필터 조건으로 ${results.length}/${targetSetCount}개만 생성되었습니다.`, 'warning', 3500);
    } else {
        ctx.appendLog(log, `> 분석 완료. 추천 조합 ${results.length}개를 생성했습니다.`, 'var(--success)');
    }

    if (executionMode === 'main_thread') {
        const executionLabel = workerTimedOut ? '메인 스레드 (워커 타임아웃 후 대체)' : '메인 스레드';
        ctx.appendLog(log, `> 실행 경로: ${executionLabel}`);
    } else {
        ctx.appendLog(log, '> 실행 경로: 워커');
    }
    ctx.appendLog(log, `> 채택된 샘플: ${accepted}/${simulationCount}`);
    if (fallbackMode === 'uniform_weights') {
        ctx.appendLog(log, `> ${UI_STRINGS.ai.uniformFallback}`, 'var(--warning)');
        UIManager.toast(UI_STRINGS.ai.uniformFallback, 'warning');
    }

    const adaptive = diagnostics.adaptive || explanations[0]?.adaptive || null;
    if (adaptive?.evaluationWindow) {
        ctx.appendLog(log, `> 실제 자동 평가 회차 수: 최근 ${adaptive.evaluationWindow}회`);
    }
    const adaptiveSelection = formatAdaptiveSelection(adaptive);
    if (adaptiveSelection) {
        ctx.appendLog(log, `> 자동 선택 결과: ${adaptiveSelection}`);
    }

    const candidatePool = Number(diagnostics.uniqueCandidates || 0);
    if (candidatePool > 0) {
        ctx.appendLog(log, `> 리랭킹 후보풀: ${candidatePool}개`);
    }
    const topScore = Number(diagnostics.topScore || 0);
    if (topScore > 0) {
        ctx.appendLog(log, `> 최고 내부 랭킹 점수: ${topScore.toFixed(4)}`);
    }
}