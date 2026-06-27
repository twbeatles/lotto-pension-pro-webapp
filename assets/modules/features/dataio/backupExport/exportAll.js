import { CONFIG } from '../../../utils/config.js';
import { UIManager } from '../../../core/UIManager.js';
import { buildBackupPayload } from '../../../utils/backup.js';
import { UI_STRINGS } from '../../../utils/strings.js';
import { BACKUP_EXPORT_DEFAULT_PREFIX } from './constants.js';
import { getUtf8ByteLength } from './utf8.js';

export const dataIoBackupExportAllMethods = {
    async exportAll(options = {}) {
        const payload = buildBackupPayload(this.data.state, {
            localUpdates: this.data.getLocalUpdates(),
            strategyPresets: this.data.state.strategyPresets || []
        });

        const json = JSON.stringify(payload, null, 2);
        const byteLength = getUtf8ByteLength(json);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const prefix = String(options.prefix || BACKUP_EXPORT_DEFAULT_PREFIX).replace(/[^a-zA-Z0-9_-]/g, '_');
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
    }
};