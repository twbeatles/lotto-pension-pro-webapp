import { dataIoImportFlowMethods } from './importFlow.js';
import { dataIoImportPayloadMethods } from './importPayload.js';
import { dataIoImportPreviewMethods } from './importPreview.js';

export const dataIoImportMethods = {
    ...dataIoImportPayloadMethods,
    ...dataIoImportPreviewMethods,
    ...dataIoImportFlowMethods
};
