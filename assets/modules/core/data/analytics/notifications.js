export const dataAnalyticsNotificationMethods = {
    getNotificationPermissionState() {
        if (typeof Notification === 'undefined') {
            return { code: 'unsupported', label: '지원 안 함' };
        }
        if (Notification.permission === 'granted') {
            return { code: 'granted', label: '허용됨' };
        }
        if (Notification.permission === 'denied') {
            return { code: 'denied', label: '차단됨' };
        }
        return { code: 'prompt', label: '권한 필요' };
    },

    async requestNotificationPermission() {
        if (typeof Notification === 'undefined') {
            return this.getNotificationPermissionState();
        }
        let permission = Notification.permission;
        if (permission === 'default') {
            try {
                permission = await Notification.requestPermission();
            } catch (e) {
                permission = Notification.permission || 'default';
            }
        }
        if (permission === 'granted') return { code: 'granted', label: '허용됨' };
        if (permission === 'denied') return { code: 'denied', label: '차단됨' };
        return { code: 'prompt', label: '권한 필요' };
    },

    sendSystemNotification(title, body) {
        const permission = this.getNotificationPermissionState();
        if (permission.code !== 'granted') return false;
        try {
            new Notification(title, { body });
            return true;
        } catch (e) {
            console.warn('시스템 알림 전송 실패', e);
            return false;
        }
    },

    sendTestSystemNotification() {
        return this.sendSystemNotification(
            '로또·연금복권 프로 테스트 알림',
            '시스템 알림 권한과 연결 상태가 정상입니다.'
        );
    }
};