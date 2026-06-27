import { $ } from '../../../utils/utils.js';

export const appSettingsPanelMethods = {
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
            themeSummary.textContent =
                theme === 'light'
                    ? '밝은 배경으로 앱을 보고 있습니다. 빠른 전환 버튼과 동일한 설정입니다.'
                    : '눈부심을 줄이는 다크 모드를 사용 중입니다. 빠른 전환 버튼과 동일한 설정입니다.';
        }

        [
            ['#settingsThemeLight', 'light'],
            ['#settingsThemeDark', 'dark']
        ].forEach(([selector, value]) => {
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
            permissionHelp.textContent =
                permission.code === 'granted'
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
                `연금복권 ${storageSummary.counts.pension720Tickets || 0}`,
                `캠페인 ${storageSummary.counts.campaigns}`,
                `연금캠페인 ${storageSummary.counts.pension720Campaigns || 0}`,
                `프리셋 ${storageSummary.counts.presets}`,
                `로컬업데이트 ${storageSummary.counts.localUpdates}`
            ].join(' · ');
        }
        const storageNotice = $('#storageHealthNote');
        if (storageNotice) storageNotice.textContent = this.getStorageHealthMessage(storageSummary);

        const proxyInput = $('#customProxyUrl');
        if (
            proxyInput &&
            document.activeElement !== proxyInput &&
            proxyInput.value !== (this.data.state.customProxy || '')
        ) {
            proxyInput.value = this.data.state.customProxy || '';
        }
        const proxyHelp = $('#customProxyHelp');
        const proxyStatus = $('#customProxyStatusNote');
        const savedProxyValidation = this.data.validateCustomProxyUrl(this.data.state.customProxy || '');
        const activeProxyConfig = this.data.resolveProxyConfig();
        if (proxyHelp) {
            proxyHelp.textContent = savedProxyValidation.empty
                ? '비워두면 기본 자동 동기화를 사용합니다. 공식 API가 막히면 corsproxy.io 등 서드파티 CORS 프록시를 경유할 수 있습니다. 자체 Worker 배포를 권장합니다. 형식: https://<worker>.workers.dev/proxy/latest'
                : savedProxyValidation.valid
                  ? '사용 가능한 데이터 연결 주소가 저장되어 있습니다.'
                  : '지원되지 않는 연결 주소는 무시되고 기본 자동 동기화를 사용합니다.';
        }
        if (proxyStatus) {
            let statusText = '';
            if (!savedProxyValidation.empty && !savedProxyValidation.valid) {
                statusText = `저장된 데이터 연결 주소를 사용하지 않습니다. ${savedProxyValidation.reason}`;
            } else if (activeProxyConfig?.invalid) {
                statusText = `${activeProxyConfig.source} 연결 형식이 지원되지 않아 기본 자동 동기화를 사용 중입니다.`;
            }
            proxyStatus.textContent = statusText;
            proxyStatus.style.display = statusText ? 'block' : 'none';
        }

        const freshness = this.data.getDataFreshness();
        const freshnessSummary = this.data.getDataFreshnessSummary?.(freshness) || '';
        const freshnessSummaryEl = $('#syncDataFreshnessSummary');
        if (freshnessSummaryEl) freshnessSummaryEl.textContent = freshnessSummary;
        const syncMeta = this.data.state.syncMeta || this.data.getDefaultSyncMeta?.() || {};
        const syncModeEl = $('#syncMetaMode');
        if (syncModeEl) syncModeEl.textContent = this.data.getSyncModeLabel(syncMeta.mode);
        const syncSourceEl = $('#syncMetaSource');
        if (syncSourceEl)
            syncSourceEl.textContent =
                syncMeta.currentSource || this.data.getDataHealthSourceLabel(freshness.source) || '-';
        const syncSuccessEl = $('#syncMetaLastSuccess');
        if (syncSuccessEl)
            syncSuccessEl.textContent = syncMeta.lastSuccessAt ? this.formatDateTime(syncMeta.lastSuccessAt) : '-';
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
            if (syncMeta.mode === 'local_restore_failed' && syncMeta.lastFailureMessage) {
                syncWarningEl.textContent = `백업 복원은 완료됐지만 당첨 데이터 재구성에 실패했습니다. ${syncMeta.lastFailureMessage}`;
            } else if (activeProxyConfig?.invalid) {
                syncWarningEl.textContent = `${activeProxyConfig.source} 연결 형식이 지원되지 않아 기본 자동 동기화를 사용 중입니다.`;
            } else if (freshness.isUnavailable) {
                syncWarningEl.textContent =
                    freshness.dataHealthMessage || '사용 가능한 당첨 데이터가 없습니다. 먼저 동기화를 시도해주세요.';
            } else if (freshness.isPartial) {
                syncWarningEl.textContent = freshness.dataHealthMessage
                    ? `${freshness.dataHealthMessage} 통계/번호 추천/시뮬레이션은 전체 데이터 복구 후 사용할 수 있습니다.`
                    : '일부 데이터만 사용 중입니다. 최신 일부 회차만 사용할 수 있어 통계 기반 기능이 제한됩니다.';
            } else if (freshness.isStale) {
                syncWarningEl.textContent = freshness.canAutoSync
                    ? `현재 데이터가 예상 최신 회차 기준으로 ${freshness.behindBy}회차 뒤처져 있습니다. 지금 동기화하면 기본 자동 경로로 최신 회차를 확인합니다.`
                    : `현재 데이터가 예상 최신 회차 기준으로 ${freshness.behindBy}회차 뒤처져 있습니다.`;
            } else if (freshness.staticBehindBy > 0) {
                syncWarningEl.textContent = `기본 포함 데이터는 예상 최신 회차 기준으로 ${freshness.staticBehindBy}회차 뒤처져 있지만 내 기기 보정 데이터가 보완하고 있습니다.`;
            } else {
                syncWarningEl.textContent = '현재 데이터는 예상 최신 회차 기준으로 최신 상태입니다.';
            }
        }

        const syncStateBadge = $('#settingsSyncStateBadge');
        if (syncStateBadge) {
            let syncState = { label: '최신', code: 'success' };
            if (syncMeta.mode === 'local_restore_failed') {
                syncState = { label: '복원 실패', code: 'danger' };
            } else if (freshness.isUnavailable) {
                syncState = { label: '데이터 없음', code: 'danger' };
            } else if (freshness.isPartial) {
                syncState = { label: '일부 데이터', code: 'danger' };
            } else if (freshness.isStale) {
                syncState = freshness.canAutoSync
                    ? { label: `${freshness.behindBy}회차 차이`, code: 'warning' }
                    : { label: '업데이트 필요', code: 'danger' };
            } else if (freshness.staticBehindBy > 0) {
                syncState = { label: '내 기기 보완', code: 'warning' };
            }
            syncStateBadge.textContent = syncState.label;
            syncStateBadge.className = `badge ${this.getStatusBadgeClass(syncState.code)}`;
        }

        this.renderPwaUpdateState?.();
    }
};