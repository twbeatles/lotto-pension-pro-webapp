import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { EXTERNAL_ASSETS, loadScriptOnce } from '../../utils/loader.js';

export const qrScannerLifecycleMethods = {
    async destroyScanner() {
        if (!this.scanner) {
            this.isScanning = false;
            return;
        }

        const current = this.scanner;
        this.scanner = null;
        this.isScanning = false;
        this.isHandlingSuccess = false;

        try {
            // stop() may throw when scanner wasn't fully started.
            await current.stop();
        } catch (e) {
            // noop
        }

        try {
            current.clear();
        } catch (e) {
            // noop
        }
    },

    async start() {
        const modal = $('#qrScanModal');
        if (!modal) return;
        UIManager.openModal(modal, {
            initialFocus: $('#closeScanBtn')
        });

        if (this.scanner) {
            // Already running or initialized
            return;
        }

        try {
            if (!window.Html5Qrcode) {
                await loadScriptOnce(EXTERNAL_ASSETS.html5QrCode);
            }
            if (!window.Html5Qrcode) throw new Error('큐알 스캐너 라이브러리를 불러오지 못했습니다.');

            this.scanner = new window.Html5Qrcode('qr-reader');
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };

            // Prefer back camera
            await this.scanner.start(
                { facingMode: 'environment' },
                config,
                (decodedText) => {
                    this.onScanSuccess(decodedText);
                },
                () => {
                    // parse error, ignore
                }
            );
            this.isScanning = true;
            this.isHandlingSuccess = false;
        } catch (err) {
            console.error('스캐너 시작 오류', err);
            UIManager.toast('카메라를 시작할 수 없습니다. 권한을 확인해주세요.', 'error');
            await this.destroyScanner();
            UIManager.closeModal(modal, { reason: 'error' });
        }
    },

    async stop() {
        const modal = $('#qrScanModal');
        if (modal) UIManager.closeModal(modal, { reason: 'close' });
        await this.destroyScanner();
    }
};