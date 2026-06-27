import { $ } from '../../utils/utils.js';
import { qrScannerLifecycleMethods } from './lifecycle.js';
import { qrScannerParserMethods } from './parser.js';
import { qrScannerScanFlowMethods } from './scanFlow.js';

export class QrScannerModule {
    constructor(app) {
        this.app = app;
        this.scanner = null;
        this.isScanning = false;
        this.isHandlingSuccess = false;
        this.bindEvents();
    }

    bindEvents() {
        $('#closeScanBtn')?.addEventListener('click', () => this.stop());
        $('#qrScanModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.stop();
        });
    }
}

Object.assign(
    QrScannerModule.prototype,
    qrScannerLifecycleMethods,
    qrScannerParserMethods,
    qrScannerScanFlowMethods
);