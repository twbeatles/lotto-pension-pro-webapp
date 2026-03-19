import { $, $$ } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
export const appSettingsMethods = {
    bindSettingsModal() {
        const open = () => this.openSettingsModal();
        const close = () => this.closeSettingsModal();

        $('#openSettingsBtn')?.addEventListener('click', open);
        $('#mobileOpenSettingsBtn')?.addEventListener('click', open);
        $('#closeSettingsBtn')?.addEventListener('click', close);
        $('#settingsModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) close();
        });

        $$('[data-theme-choice]').forEach((button) => {
            button.addEventListener('click', () => {
                this.setTheme(button.dataset.themeChoice);
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSettingsModalOpen()) {
                close();
            }
        });
    },

    isSettingsModalOpen() {
        return $('#settingsModal')?.classList.contains('active') || false;
    },

    openSettingsModal() {
        this.renderSettingsPanel();
        const modal = $('#settingsModal');
        if (!modal) return;
        modal.classList.add('active');
        // 포커스 우선순위: 닫기 버튼 → 모달 내 첫 포커스 가능 요소 → 모달 자체
        const closeBtn = $('#closeSettingsBtn');
        if (closeBtn) {
            closeBtn.focus();
        } else {
            const focusable = modal.querySelector(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            (focusable || modal).focus();
        }
    },

    closeSettingsModal() {
        $('#settingsModal')?.classList.remove('active');
    },

    renderSettingsPanel() {
        if (typeof document === 'undefined') return;
        const theme = this.data.state.theme === 'light' ? 'light' : 'dark';
        const themeBadge = $('#settingsThemeBadge');
        if (themeBadge) {
            themeBadge.textContent = theme === 'light' ? '라이트 모드' : '다크 모드';
            themeBadge.className = 'badge status-badge is-good';
        }

        const themeSummary = $('#settingsThemeSummary');
        if (themeSummary) {
            themeSummary.textContent = theme === 'light'
                ? '밝은 배경으로 앱을 보고 있습니다. 빠른 전환 버튼과 동일한 설정입니다.'
                : '눈부심을 줄이는 다크 모드를 사용 중입니다. 빠른 전환 버튼과 동일한 설정입니다.';
        }

        [['#settingsThemeLight', 'light'], ['#settingsThemeDark', 'dark']].forEach(([selector, value]) => {
            const button = $(selector);
            if (!button) return;
            const active = theme === value;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        const inApp = $('#alertEnableInApp');
        const system = $('#alertEnableSystem');
        const notify = $('#alertNotifyOnResult');
        if (inApp) inApp.checked = this.data.state.alertPrefs?.enableInApp !== false;
        if (system) system.checked = Boolean(this.data.state.alertPrefs?.enableSystemNotification);
        if (notify) notify.checked = this.data.state.alertPrefs?.notifyOnNewResult !== false;

        const permission = this.data.getNotificationPermissionState();
        const permissionBadge = $('#systemNotificationStatusBadge');
        if (permissionBadge) {
            permissionBadge.textContent = permission.label;
            permissionBadge.className = `badge ${this.getStatusBadgeClass(permission.code)}`;
        }
        const permissionHelp = $('#systemNotificationHelp');
        if (permissionHelp) {
            permissionHelp.textContent = permission.code === 'granted'
                ? '브라우저 권한이 허용되어 있습니다.'
                : permission.code === 'unsupported'
                    ? '현재 환경에서는 시스템 알림을 지원하지 않습니다.'
                    : '시스템 알림 토글을 켜면 권한을 요청합니다.';
        }

        const storageSummary = this.data.getStorageSummary();
        const storageBadge = $('#storageHealthBadge');
        if (storageBadge) {
            storageBadge.textContent = this.getStorageHealthLabel(storageSummary.status);
            storageBadge.className = `badge ${this.getStatusBadgeClass(storageSummary.status)}`;
        }
        const storageUsage = $('#storageUsageValue');
        if (storageUsage) storageUsage.textContent = this.formatBytes(storageSummary.bytes);
        const storageCounts = $('#storageCountsValue');
        if (storageCounts) {
            storageCounts.textContent = [
                `즐겨찾기 ${storageSummary.counts.favorites}`,
                `기록 ${storageSummary.counts.history}`,
                `티켓 ${storageSummary.counts.tickets}`,
                `캠페인 ${storageSummary.counts.campaigns}`,
                `프리셋 ${storageSummary.counts.presets}`,
                `로컬업데이트 ${storageSummary.counts.localUpdates}`
            ].join(' · ');
        }
        const storageNotice = $('#storageHealthNote');
        if (storageNotice) storageNotice.textContent = this.getStorageHealthMessage(storageSummary);

        const proxyInput = $('#customProxyUrl');
        if (proxyInput && document.activeElement !== proxyInput && proxyInput.value !== (this.data.state.customProxy || '')) {
            proxyInput.value = this.data.state.customProxy || '';
        }
        const proxyHelp = $('#customProxyHelp');
        const proxyStatus = $('#customProxyStatusNote');
        const savedProxyValidation = this.data.validateCustomProxyUrl(this.data.state.customProxy || '');
        const activeProxyConfig = this.data.resolveProxyConfig();
        if (proxyHelp) {
            proxyHelp.textContent = savedProxyValidation.empty
                ? '비워두면 기본 자동 동기화를 사용합니다. 공식 지원 형식: https://<worker>.workers.dev/proxy/latest'
                : savedProxyValidation.valid
                    ? '공식 지원 형식의 사용자 프록시가 저장되어 있습니다.'
                    : '지원되지 않는 프록시 형식은 무시되고 기본 자동 동기화로 내려갑니다.';
        }
        if (proxyStatus) {
            let statusText = '';
            if (!savedProxyValidation.empty && !savedProxyValidation.valid) {
                statusText = `저장된 프록시 주소를 사용하지 않습니다. ${savedProxyValidation.reason}`;
            } else if (activeProxyConfig?.invalid) {
                statusText = `${activeProxyConfig.source}의 프록시 형식이 지원되지 않아 기본 자동 동기화를 사용 중입니다.`;
            }
            proxyStatus.textContent = statusText;
            proxyStatus.style.display = statusText ? 'block' : 'none';
        }

        const freshness = this.data.getDataFreshness();
        const syncMeta = this.data.state.syncMeta || this.data.getDefaultSyncMeta?.() || {};
        const syncModeEl = $('#syncMetaMode');
        if (syncModeEl) syncModeEl.textContent = this.data.getSyncModeLabel(syncMeta.mode);
        const syncSourceEl = $('#syncMetaSource');
        if (syncSourceEl) syncSourceEl.textContent = syncMeta.currentSource || '-';
        const syncSuccessEl = $('#syncMetaLastSuccess');
        if (syncSuccessEl) syncSuccessEl.textContent = syncMeta.lastSuccessAt ? this.formatDateTime(syncMeta.lastSuccessAt) : '-';
        const syncDrawEl = $('#syncMetaLastDraw');
        if (syncDrawEl) syncDrawEl.textContent = syncMeta.lastSuccessDrawNo ? `${syncMeta.lastSuccessDrawNo}회차` : '-';
        const syncFailureEl = $('#syncMetaLastFailure');
        if (syncFailureEl) {
            syncFailureEl.textContent = syncMeta.lastFailureMessage
                ? `${this.formatDateTime(syncMeta.lastFailureAt)} · ${syncMeta.lastFailureMessage}`
                : '-';
        }
        const syncWarningMetaEl = $('#syncMetaLastWarning');
        if (syncWarningMetaEl) {
            syncWarningMetaEl.textContent = syncMeta.lastWarningMessage
                ? `${this.formatDateTime(syncMeta.lastWarningAt)} · ${syncMeta.lastWarningMessage}`
                : '-';
        }
        const syncWarningEl = $('#syncMetaWarning');
        if (syncWarningEl) {
            if (activeProxyConfig?.invalid) {
                syncWarningEl.textContent = `${activeProxyConfig.source} 프록시 형식이 지원되지 않아 기본 자동 동기화로 전환되어 있습니다.`;
            } else if (freshness.isStale) {
                syncWarningEl.textContent = freshness.canAutoSync
                    ? `현재 데이터가 예상 최신 회차 기준으로 ${freshness.behindBy}회차 뒤처져 있습니다. 지금 동기화하면 기본 자동 경로로 최신 회차를 확인합니다.`
                    : `현재 데이터가 예상 최신 회차 기준으로 ${freshness.behindBy}회차 뒤처져 있습니다.`;
            } else if (freshness.staticBehindBy > 0) {
                syncWarningEl.textContent = `정적 JSON은 예상 최신 회차 기준으로 ${freshness.staticBehindBy}회차 뒤처져 있지만 로컬 업데이트가 보완하고 있습니다.`;
            } else {
                syncWarningEl.textContent = '현재 데이터는 예상 최신 회차 기준으로 최신 상태입니다.';
            }
        }

        const syncStateBadge = $('#settingsSyncStateBadge');
        if (syncStateBadge) {
            let syncState = { label: '최신', code: 'success' };
            if (freshness.isStale) {
                syncState = freshness.canAutoSync
                    ? { label: `${freshness.behindBy}회차 차이`, code: 'warning' }
                    : { label: '업데이트 필요', code: 'danger' };
            } else if (freshness.staticBehindBy > 0) {
                syncState = { label: '로컬 업데이트 보완', code: 'warning' };
            }
            syncStateBadge.textContent = syncState.label;
            syncStateBadge.className = `badge ${this.getStatusBadgeClass(syncState.code)}`;
        }
    },

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
        if (summary.status === 'danger') {
            return '저장량이 커졌습니다. 백업 후 오래된 티켓/히스토리를 수동으로 정리하는 것을 권장합니다.';
        }
        if (summary.status === 'warning') {
            if (summary.warnings.length) {
                return `권장 관리 기준 초과: ${summary.warnings.join(', ')}. 자동 삭제는 하지 않으며 직접 정리할 수 있습니다.`;
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
    },

    async handleSystemNotificationToggle(enabled) {
        if (!enabled) {
            this.data.setAlertPrefs({ enableSystemNotification: false });
            this.renderSettingsPanel?.();
            this.renderDataLists?.();
            return;
        }

        const permission = await this.data.requestNotificationPermission();
        if (permission.code === 'granted') {
            this.data.setAlertPrefs({ enableSystemNotification: true });
            UIManager.toast('시스템 알림이 활성화되었습니다.', 'success');
        } else {
            this.data.setAlertPrefs({ enableSystemNotification: false });
            UIManager.toast(
                permission.code === 'unsupported'
                    ? '이 브라우저는 시스템 알림을 지원하지 않습니다.'
                    : '시스템 알림 권한이 필요합니다.',
                permission.code === 'unsupported' ? 'warning' : 'info'
            );
        }
        this.renderSettingsPanel?.();
        this.renderDataLists?.();
    },

    async handleTestSystemNotification() {
        let permission = this.data.getNotificationPermissionState();
        if (permission.code === 'unsupported') {
            UIManager.toast('이 브라우저는 시스템 알림을 지원하지 않습니다.', 'warning');
            this.renderSettingsPanel?.();
            this.renderDataLists?.();
            return;
        }
        if (permission.code !== 'granted') {
            permission = await this.data.requestNotificationPermission();
        }
        if (permission.code !== 'granted') {
            UIManager.toast('테스트 알림을 보내려면 시스템 알림 권한이 필요합니다.', 'info');
            this.renderSettingsPanel?.();
            this.renderDataLists?.();
            return;
        }
        this.data.sendTestSystemNotification();
        UIManager.toast('테스트 알림을 보냈습니다.', 'success');
        this.renderSettingsPanel?.();
        this.renderDataLists?.();
    }
};
