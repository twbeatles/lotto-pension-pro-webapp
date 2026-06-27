export const appSettingsFormatterMethods = {
    formatBytes(bytes = 0) {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
    },

    formatDateTime(value) {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    getStorageHealthLabel(status) {
        if (status === 'danger') return '위험';
        if (status === 'warning') return '주의';
        return '정상';
    },

    getStorageHealthMessage(summary) {
        if (summary.storageFailures?.length) {
            const latest = summary.storageFailures[0];
            return `localStorage 저장 실패가 감지되었습니다. 마지막 실패: ${latest.key || '-'} (${latest.name || 'error'})`;
        }
        if (summary.status === 'danger') {
            return '저장량이 커졌습니다. 백업 후 오래된 히스토리와 정산 끝난 미당첨 번호를 정리하는 것을 권장합니다.';
        }
        if (summary.status === 'warning') {
            if (summary.warnings.length) {
                return `권장 관리 기준 초과: ${summary.warnings.join(', ')}. 백업하고 정리하기로 안전하게 줄일 수 있습니다.`;
            }
            return '저장량이 늘어나는 중입니다. 자동 삭제 없이 경고만 표시합니다.';
        }
        return '현재 저장 상태는 안정적입니다.';
    },

    getStatusBadgeClass(code) {
        if (code === 'granted' || code === 'normal' || code === 'success') return 'status-badge is-good';
        if (code === 'warning' || code === 'prompt') return 'status-badge is-warn';
        if (code === 'danger' || code === 'denied') return 'status-badge is-bad';
        return 'status-badge';
    }
};