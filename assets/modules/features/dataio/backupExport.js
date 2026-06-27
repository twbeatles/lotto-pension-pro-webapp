import { BACKUP_BEFORE_CHANGE_PREFIX, BACKUP_EXPORT_DEFAULT_PREFIX } from './backupExport/constants.js';
import { dataIoBackupExportAllMethods } from './backupExport/exportAll.js';
import { dataIoBackupDestructiveMethods } from './backupExport/destructive.js';

export { BACKUP_BEFORE_CHANGE_PREFIX, BACKUP_EXPORT_DEFAULT_PREFIX };

export const dataIoBackupMethods = {
    ...dataIoBackupExportAllMethods,
    ...dataIoBackupDestructiveMethods
};

export { getUtf8ByteLength } from './backupExport/utf8.js';