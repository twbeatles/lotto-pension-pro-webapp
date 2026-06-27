import { CONFIG } from '../../../utils/config.js';
import { buildMergeImportPreview } from './mergeMode.js';
import { buildOverwriteImportPreview } from './overwriteMode.js';

export const dataIoImportPreviewMethods = {
    buildImportPreview(incoming, importOptions) {
        const merge = importOptions.mode === 'merge';
        if (merge) {
            return buildMergeImportPreview(this, incoming, importOptions);
        }
        return buildOverwriteImportPreview(this, incoming, importOptions);
    },

    buildImportPreviewMessage(prepared) {
        const modeLabel = prepared.mode === 'overwrite' ? '바꾸기' : '합치기';
        const applied = prepared.preview.appliedSettings.length ? prepared.preview.appliedSettings.join(', ') : '없음';
        return [
            `${modeLabel} 가져오기를 진행할까요?`,
            '',
            `추가/반영: ${prepared.preview.added}건`,
            `중복: ${prepared.preview.duplicate}건`,
            `건너뜀: ${prepared.preview.skipped}건`,
            `정리될 캠페인: ${prepared.preview.cleaned}개`,
            `예상 연금복권 저장 수: ${prepared.next.pension720Tickets?.length || 0}개`,
            `예상 연금복권 캠페인: ${prepared.next.pension720Campaigns?.length || 0}개`,
            `적용될 설정: ${applied}`,
            `미래 회차 제외: ${prepared.preview.futureDropped}건`,
            `예상 내 번호 수: ${prepared.preview.projectedTicketTotal}개`,
            `예상 생성 히스토리: ${prepared.preview.projectedHistoryCount ?? prepared.next.history?.length ?? 0}개`,
            prepared.preview.historyTrimmed
                ? `히스토리 정리: ${prepared.preview.historyTrimmed}건이 ${CONFIG.LIMITS.MAX_HIST}개 한도로 잘립니다.`
                : '',
            prepared.preview.droppedInvalidProxy
                ? '지원되지 않는 데이터 연결 주소는 가져오지 않고 기본 자동 동기화를 사용합니다.'
                : '',
            prepared.mode === 'overwrite' ? '현재 데이터는 자동 백업 파일로 먼저 저장됩니다.' : ''
        ]
            .filter((line) => line !== '')
            .join('\n');
    }
};