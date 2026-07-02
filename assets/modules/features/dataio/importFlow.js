import { CONFIG } from '../../utils/config.js';
import { UIManager } from '../../core/UIManager.js';
import { normalizeBackupPayload } from '../../utils/backup.js';
import { UI_STRINGS } from '../../utils/strings.js';

export const dataIoImportFlowMethods = {
    async confirmPreparedImport(prepared) {
        if (typeof document === 'undefined' || typeof UIManager.confirm !== 'function') return true;
        return UIManager.confirm({
            title: '백업 파일 가져오기 확인',
            message: this.buildImportPreviewMessage(prepared),
            confirmText: prepared.mode === 'overwrite' ? '바꾸기 실행' : '합치기 실행'
        });
    },

    applyPreparedImport(prepared) {
        const next = prepared.next;
        this.data.state.favorites = next.favorites;
        this.data.state.history = next.history;
        this.data.state.ticketBook = next.tickets;
        this.data.state.campaigns = next.campaigns;
        this.data.state.pension720Tickets = next.pension720Tickets;
        this.data.state.pension720Campaigns = next.pension720Campaigns;
        this.data.state.strategyPresets = next.strategyPresets;
        this.data.state.alertPrefs = next.alertPrefs;
        this.data.state.theme = next.theme;
        this.data.state.customProxy = next.proxy;
        this.data.state.strategyPrefs = next.strategyPrefs;
        this.data.setLocalUpdates(next.localUpdates, { warningMode: 'manual' });

        if (prepared.importOptions.applyProxy) this.syncProxyInput();
        if (prepared.importOptions.applyTheme) this.app?.applyTheme?.();
    },

    async importAll(e) {
        if (this._importInFlight) {
            UIManager.toast('다른 가져오기 작업이 진행 중입니다.', 'info', 2500);
            return;
        }

        const input = e.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        if (Number(file.size || 0) > CONFIG.LIMITS.MAX_IMPORT_BYTES) {
            UIManager.toast(
                `백업 파일은 최대 ${(CONFIG.LIMITS.MAX_IMPORT_BYTES / (1024 * 1024)).toFixed(1)}MB까지 가져올 수 있습니다.`,
                'error',
                3500
            );
            input.value = '';
            return;
        }

        this._importInFlight = true;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const normalized = normalizeBackupPayload(json);
            if (!normalized) {
                UIManager.toast(UI_STRINGS.dataio.importUnsupported, 'error', 3500);
                return;
            }

            const incoming = this.normalizeImportPayload(normalized);
            const importOptions = this.getImportOptionsFromUI();
            const prepared = this.buildImportPreview(incoming, importOptions);
            if (prepared.preview.projectedTicketTotal > CONFIG.LIMITS.MAX_IMPORT_TICKETS) {
                UIManager.toast(
                    `내 번호 보관함은 최대 ${CONFIG.LIMITS.MAX_IMPORT_TICKETS}개 번호까지 가져올 수 있습니다.`,
                    'error',
                    3500
                );
                return;
            }
            if ((prepared.next.pension720Tickets?.length || 0) > CONFIG.LIMITS.MAX_PENSION720_TICKETS) {
                UIManager.toast(
                    `연금복권 저장 목록은 최대 ${CONFIG.LIMITS.MAX_PENSION720_TICKETS}개까지 가져올 수 있습니다.`,
                    'error',
                    3500
                );
                return;
            }

            const confirmed = await this.confirmPreparedImport(prepared);
            if (!confirmed) {
                UIManager.toast('가져오기를 취소했습니다.', 'info');
                return;
            }

            if (prepared.mode === 'overwrite') {
                const backup = await this.ensureBackupBeforeDestructive?.({
                    prefix: 'lotto_pension_pro_before_replace',
                    errorMessage: '백업 파일 다운로드를 확인할 수 없어 덮어쓰기를 중단했습니다.'
                });
                if (!backup) return;
            }
            this.applyPreparedImport(prepared);

            if (prepared.preview.droppedInvalidProxy) {
                UIManager.toast(
                    '지원되지 않는 데이터 연결 주소는 무시했습니다. 기본 자동 동기화를 사용합니다.',
                    'warning',
                    3500
                );
            }
            if (prepared.preview.historyTrimmed > 0) {
                UIManager.toast(
                    `생성 히스토리 ${prepared.preview.historyTrimmed}건을 ${CONFIG.LIMITS.MAX_HIST}개 한도에 맞게 정리했습니다.`,
                    'info',
                    3500
                );
            }

            if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
                this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
            }

            this.data.markAllDirty?.();
            this.data.save(true);
            this.app?.renderSettingsPanel?.();
            this.refreshPresetSelectors();
            await this.runPostImportRefresh();

            const message =
                prepared.mode === 'merge'
                    ? UI_STRINGS.dataio.mergeComplete(prepared.preview)
                    : UI_STRINGS.dataio.overwriteComplete({
                          added: prepared.preview.added,
                          skipped: prepared.preview.skipped,
                          applied: prepared.preview.appliedSettings,
                          cleaned: prepared.preview.cleaned,
                          futureDropped: prepared.preview.futureDropped
                      });
            UIManager.toast(message, 'success');
        } catch (err) {
            console.error('Import failed', err);
            UIManager.toast(UI_STRINGS.dataio.importInvalid, 'error', 3500);
        } finally {
            this._importInFlight = false;
            input.value = '';
        }
    }
};
