import { UIManager } from '../../../core/UIManager.js';
import { BACKUP_BEFORE_CHANGE_PREFIX } from './constants.js';

export const dataIoBackupDestructiveMethods = {
    async ensureBackupBeforeDestructive(options = {}) {
        const result = await this.exportAll({
            silent: true,
            prefix: options.prefix || BACKUP_BEFORE_CHANGE_PREFIX,
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