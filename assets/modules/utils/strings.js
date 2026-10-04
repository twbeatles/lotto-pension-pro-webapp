export const UI_STRINGS = {
    common: {
        close: '닫기',
        cancel: '취소',
        confirm: '확인',
        delete: '삭제',
        save: '저장',
        install: '설치',
        openSettings: '설정 열기',
        noData: '아직 표시할 내용이 없어요.'
    },
    dialog: {
        confirmTitle: '작업을 확인해주세요.',
        promptTitle: '입력이 필요합니다.',
        defaultConfirmMessage: '이 작업을 진행할까요?',
        defaultPromptMessage: '계속하려면 값을 입력해주세요.'
    },
    generator: {
        generating: '번호 생성 중...',
        generatingCampaign: '회차 묶음 생성 중...',
        workerFallback: '계산이 오래 걸려 다른 방법으로 이어서 만들고 있어요.',
        workerFallbackCampaign: '회차 묶음 계산이 오래 걸려 다른 방법으로 이어서 만들고 있어요.',
        dataUnavailable: '당첨 번호 데이터를 아직 불러오지 못했어요. 설정에서 「최신 회차 확인」을 눌러 주세요.'
    },
    ai: {
        workerFallback: '계산이 오래 걸려 다른 방법으로 이어서 추천하고 있어요.',
        workerTimeoutAuto: '자동 선택 계산이 오래 걸리고 있어요. 분석 강도를 「빠름」으로 낮춰 다시 시도해 주세요.',
        uniformFallback: '조건에 맞는 조합이 적어 모든 번호를 같은 비중으로 추천했어요.'
    },
    backtest: {
        stopped: '시뮬레이션을 중지했습니다.',
        payoutFast: '1~5등 모두 평균 당첨금으로 계산합니다.',
        payoutHybrid: '1등은 그 회차 실제 당첨금, 2~5등은 평균 당첨금으로 계산합니다.',
        started: '시뮬레이션을 시작했어요. 잠시만 기다려 주세요.',
        emptyExport: '내보낼 비교 결과가 없습니다.',
        exported: '비교 결과 파일(CSV)을 저장했습니다.'
    },
    dataio: {
        backupExported: '백업 파일을 저장했습니다.',
        importUnsupported: '지원되지 않는 백업 형식입니다.',
        importInvalid: '백업 파일을 읽지 못했습니다.',
        mergeComplete({ added = 0, duplicate = 0, skipped = 0, applied = [], cleaned = 0, futureDropped = 0 } = {}) {
            const cleanupSuffix = cleaned > 0 ? `, 정리 ${cleaned}개 회차 묶음` : '';
            const futureSuffix = futureDropped > 0 ? `, 미래 회차 제외 ${futureDropped}건` : '';
            const suffix = applied.length ? `, 적용: ${applied.join('/')}` : '';
            return `백업을 합쳐서 불러왔습니다. 추가 ${added}건, 중복 ${duplicate}건, 건너뜀 ${skipped}건${cleanupSuffix}${futureSuffix}${suffix}`;
        },
        overwriteComplete({ added = 0, skipped = 0, applied = [], cleaned = 0, futureDropped = 0 } = {}) {
            const skippedSuffix = skipped > 0 ? `, 건너뜀 ${skipped}건` : '';
            const cleanupSuffix = cleaned > 0 ? `, 정리 ${cleaned}개 회차 묶음` : '';
            const futureSuffix = futureDropped > 0 ? `, 미래 회차 제외 ${futureDropped}건` : '';
            const suffix = applied.length ? `, 적용: ${applied.join('/')}` : '';
            return `백업으로 바꿔서 불러왔습니다. 반영 ${added}건${skippedSuffix}${cleanupSuffix}${futureSuffix}${suffix}`;
        }
    },
    sync: {
        alreadyRunning: '이미 최신 회차를 확인하는 중이에요.',
        cancelled: '최신 회차 확인을 취소했습니다.',
        upToDate: '이미 최신 상태입니다.',
        updatedCount(count = 0, futureDropped = 0) {
            const futureSuffix = futureDropped > 0 ? ` 아직 추첨 전인 회차 ${futureDropped}개는 제외했어요.` : '';
            return `새 당첨 결과 ${count}회차를 반영했습니다.${futureSuffix}`;
        },
        latestUnavailable: '최신 회차를 확인하지 못했습니다.',
        latestUnavailableThirdParty:
            '최신 회차를 확인하지 못했습니다. 공개 CORS 중계 경로가 잠시 불안정할 수 있어요. 잠시 후 다시 시도해 주세요.',
        genericError: '최신 회차를 받아오는 중 문제가 생겼습니다.',
        genericErrorThirdParty:
            '최신 회차를 받아오는 중 문제가 생겼습니다. 공개 CORS 중계 경로가 불안정할 수 있어요. 잠시 후 다시 시도해 주세요.',
        logUpToDate: '이미 최신 상태입니다.',
        logRange(fromNo, toNo) {
            return `확인할 회차: ${fromNo}~${toNo}회`;
        },
        logSource(source = '') {
            return `받아오는 곳: ${source || '기본 자동 연결'}`;
        },
        logFallbackLimit(count = 0, limit = 0) {
            return `확인할 회차가 ${count}개라 최근 ${limit}개만 다시 받아옵니다.`;
        },
        logApplied(count = 0) {
            return `새 당첨 결과 ${count}회차를 반영했습니다.`;
        },
        logNoNew: '새로 나온 회차가 없습니다.',
        logCancelled: '확인을 취소했습니다.',
        logError(message = '') {
            return `오류: ${message}`;
        },
        logThirdPartyHint: '참고: 기본 연결은 공개 CORS 중계를 거칠 수 있어 가끔 느리거나 실패할 수 있어요.'
    },
    moreMenu: {
        title: '더보기',
        subtitle: '연금복권, 시뮬레이션, 설정을 열 수 있어요.',
        simulation: '시뮬레이션',
        settings: '설정',
        install: '앱 설치',
        unavailableInstall:
            '이 브라우저에서는 바로 설치할 수 없어요. 브라우저 메뉴의 「홈 화면에 추가」를 이용해 주세요.'
    },
    pwa: {
        cachePending: '앱 설치가 끝나면 오프라인용 파일 준비 상태를 확인합니다.',
        cacheOk(version = '') {
            return version
                ? `기본 캐시 준비 완료 · 오프라인 사용 가능 (${version})`
                : '기본 캐시 준비 완료 · 오프라인 사용 가능';
        },
        cacheWarning(count = 0) {
            return `오프라인용 파일 ${count}개를 준비하지 못했어요. 앱 업데이트를 확인해 주세요.`;
        },
        cacheNotReady: '오프라인용 파일 상태를 아직 확인하지 못했어요. 설치 직후라면 정상입니다.',
        badgePending: '확인 전',
        badgeOk: '정상',
        badgeWarning(count = 0) {
            return `주의 ${count}`;
        },
        badgeNotReady: '준비 중',
        updateFlushHint: '저장 중인 번호를 먼저 저장한 뒤 업데이트합니다.',
        updateReloadOtherTab: '다른 창에서 앱이 업데이트되어 화면을 새로고침합니다.'
    },
    check: {
        emptySelection: '확인할 번호를 골라 주세요.',
        selectionHint: '목록에서 번호를 고르고 「당첨 확인하기」를 누르세요.',
        scannedEmpty: 'QR에서 로또 번호를 찾지 못했어요. 다시 비춰 주세요.',
        scannedAdded(count = 0) {
            return `${count}게임을 읽었어요.`;
        },
        sourceLabels: {
            favorites: '즐겨찾기',
            history: '생성 기록',
            tickets: '구매한 번호',
            scanned: 'QR 스캔 결과'
        },
        ticketStatus: {
            all: '전체',
            pending: '추첨 전',
            win: '당첨',
            lose: '미당첨'
        }
    },
    presets: {
        promptTitle: '저장한 설정 이름을 입력하세요.',
        promptMessage: '지금 고른 방식과 조건을 저장할 이름을 적어 주세요.',
        overwriteTitle(name = '') {
            return `'${name}' 설정을 덮어쓸까요?`;
        },
        deleteTitle(name = '') {
            return `'${name}' 설정을 삭제할까요?`;
        }
    }
};

export function formatStrategyOptionLabel(item = {}) {
    return item.experimental ? `${item.label} (실험 중)` : item.label;
}
