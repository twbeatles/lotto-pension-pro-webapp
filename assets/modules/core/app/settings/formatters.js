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
            return `기기에 저장하지 못한 항목이 있어요 (${latest.key || '-'}). 백업한 뒤 오래된 기록을 정리해 주세요.`;
        }
        if (summary.status === 'danger') {
            return '저장 공간이 꽤 찼어요. 백업한 뒤 오래된 생성 기록과 결과가 나온 미당첨 번호를 정리해 주세요.';
        }
        if (summary.status === 'warning') {
            if (summary.warnings.length) {
                return `저장 항목이 많아요: ${summary.warnings.join(', ')}. 「백업하고 정리하기」로 안전하게 줄일 수 있어요.`;
            }
            return '저장 항목이 늘어나고 있어요. 자동으로 지우지는 않습니다.';
        }
        return '저장 공간은 넉넉해요.';
    },

    getStatusBadgeClass(code) {
        if (code === 'granted' || code === 'normal' || code === 'success') return 'status-badge is-good';
        if (code === 'warning' || code === 'prompt') return 'status-badge is-warn';
        if (code === 'danger' || code === 'denied') return 'status-badge is-bad';
        return 'status-badge';
    }
};