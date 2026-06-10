import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';

export const dataIoEventMethods = {
    bindEvents() {
        $('#exportAll')?.addEventListener('click', () => {
            this.exportAll().catch((error) => {
                console.error('Backup export failed', error);
                UIManager.toast('백업 파일을 생성하지 못했습니다.', 'error', 3500);
            });
        });
        $('#importAllTrigger')?.addEventListener('click', () => $('#importInput')?.click());
        $('#importInput')?.addEventListener('change', (e) => this.importAll(e));
        $('#importMode')?.addEventListener('change', (e) =>
            this.applyImportModeDefaults(String(e.target.value || 'merge'))
        );
        this.applyImportModeDefaults(String($('#importMode')?.value || 'merge'));
        this.renderDataStatusSummary();
    }
};
