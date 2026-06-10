import { dataIoBackupMethods } from './backupExport.js';
import { dataIoEventMethods } from './events.js';
import { dataIoNormalizationMethods } from './normalizers.js';
import { dataIoStatusMethods } from './statusSummary.js';
import { dataIoUiOptionMethods } from './uiOptions.js';

export const dataIoSupportMethods = {
    ...dataIoEventMethods,
    ...dataIoStatusMethods,
    ...dataIoBackupMethods,
    ...dataIoNormalizationMethods,
    ...dataIoUiOptionMethods
};
