import { CONFIG } from '../../utils/config.js';
import { UIManager } from '../../core/UIManager.js';
import { buildBackupPayload } from '../../utils/backup.js';
import { UI_STRINGS } from '../../utils/strings.js';

function getUtf8ByteLength(value = '') {
    const text = String(value || '');
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
}

export const dataIoBackupMethods = {
    async exportAll(options = {}) {
        const payload = buildBackupPayload(this.data.state, {
            localUpdates: this.data.getLocalUpdates(),
            strategyPresets: this.data.state.strategyPresets || []
        });

        const json = JSON.stringify(payload, null, 2);
        const byteLength = getUtf8ByteLength(json);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const prefix = String(options.prefix || 'lotto_pension_pro_backup_v5').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${prefix}_${ts}.json`;
        if (
            typeof document === 'undefined' ||
            typeof document.createElement !== 'function' ||
            typeof Blob === 'undefined' ||
            typeof URL === 'undefined' ||
            typeof URL.createObjectURL !== 'function'
        ) {
            return {
                filename,
                payload,
                downloaded: false,
                saved: false,
                method: 'unavailable',
                byteLength
            };
        }
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

        if (
            options.preferFilePicker &&
            typeof window !== 'undefined' &&
            typeof window.showSaveFilePicker === 'function'
        ) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [
                        {
                            description: 'JSON backup',
                            accept: {
                                'application/json': ['.json']
                            }
                        }
                    ]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                if (!options.silent) UIManager.toast(UI_STRINGS.dataio.backupExported, 'success');
                return {
                    filename: handle.name || filename,
                    payload,
                    downloaded: true,
                    saved: true,
                    method: 'file-picker',
                    byteLength
                };
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return {
                        filename,
                        payload,
                        downloaded: false,
                        saved: false,
                        canceled: true,
                        method: 'file-picker',
                        byteLength
                    };
                }
                console.warn('File picker backup failed; falling back to download anchor.', error);
            }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (!options.silent) {
            const warningLimit = Number(CONFIG.LIMITS.IMPORT_SIZE_WARNING_BYTES || 0);
            if (warningLimit > 0 && byteLength >= warningLimit) {
                UIManager.toast(
                    `백업 파일이 ${(byteLength / (1024 * 1024)).toFixed(1)}MB입니다. 복원 한도는 ${(
                        CONFIG.LIMITS.MAX_IMPORT_BYTES /
                        (1024 * 1024)
                    ).toFixed(1)}MB입니다.`,
                    'warning',
                    4500
                );
            } else {
                UIManager.toast(UI_STRINGS.dataio.backupExported, 'success');
            }
        }
        return {
            filename: a.download,
            payload,
            downloaded: true,
            saved: false,
            method: 'download-anchor',
            byteLength
        };
    },

    async ensureBackupBeforeDestructive(options = {}) {
        const result = await this.exportAll({
            silent: true,
            prefix: options.prefix || 'lotto_pension_pro_before_change',
            preferFilePicker: true
        });
        if (result?.saved) {
            UIManager.toast(options.savedMessage || '백업 파일 저장을 완료했습니다.', 'success', 2500);
            return result;
        }
        if (result?.downloaded) {
            const confirmed = await UIManager.confirm({
                title: options.confirmTitle || '백업 파일 확인',
                message:
                    options.confirmMessage ||
                    `백업 다운로드를 시작했습니다${result.filename ? `: ${result.filename}` : ''}.\n` +
                        `파일 크기: ${((result.byteLength || 0) / 1024).toFixed(1)}KB\n` +
                        '브라우저 다운로드 목록에서 파일 저장 완료를 확인한 뒤 계속 진행하세요.\n' +
                        '다운로드가 차단되었거나 실패했으면 중단을 선택하세요.',
                confirmText: options.confirmText || '백업 확인 후 진행',
                cancelText: options.cancelText || '중단'
            });
            if (confirmed) return result;
            UIManager.toast(options.cancelMessage || '백업 확인이 취소되어 작업을 중단했습니다.', 'info', 3500);
            return null;
        }
        UIManager.toast(
            options.errorMessage || '백업 파일 다운로드를 확인할 수 없어 작업을 중단했습니다.',
            'error',
            4500
        );
        return null;
    }
};

export { getUtf8ByteLength };
