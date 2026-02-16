import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

export class QrScannerModule {
    constructor(app) {
        this.app = app;
        this.scanner = null;
        this.isScanning = false;
        this.bindEvents();
    }

    bindEvents() {
        // Button to open scanner (add this button ID to index.html or CheckModule)
        $('#openQrScannerBtn')?.addEventListener('click', () => this.start());
        $('#closeScanBtn')?.addEventListener('click', () => this.stop());
    }

    async start() {
        const modal = $('#qrScanModal');
        if (!modal) return;
        modal.classList.add('active');

        if (this.scanner) {
            // Already running or initialized
            return;
        }

        try {
            this.scanner = new Html5Qrcode("qr-reader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };

            // Prefer back camera
            await this.scanner.start(
                { facingMode: "environment" },
                config,
                (decodedText, decodedResult) => {
                    this.onScanSuccess(decodedText, decodedResult);
                },
                (errorMessage) => {
                    // parse error, ignore
                }
            );
            this.isScanning = true;
        } catch (err) {
            console.error("Error starting scanner", err);
            UIManager.toast("카메라를 시작할 수 없습니다. 권한을 확인해주세요.", "error");
            this.stop();
        }
    }

    stop() {
        const modal = $('#qrScanModal');
        if (modal) modal.classList.remove('active');

        if (this.scanner && this.isScanning) {
            this.scanner.stop().then(() => {
                this.scanner.clear();
                this.scanner = null;
                this.isScanning = false;
            }).catch(err => {
                console.error("Failed to stop scanner", err);
            });
        }
    }

    onScanSuccess(decodedText, decodedResult) {
        // Example format: http://m.dhlottery.co.kr/?v=0861q020612162843q030614182235q121330363842q172930333738q1123283236441316130938
        // Parse logic here
        // Parse logic here
        // console.log(`Scan result: ${decodedText}`);

        try {
            const numbers = this.parseLottoQr(decodedText);
            if (numbers && numbers.length > 0) {
                this.stop();
                UIManager.toast('QR 스캔 성공!', 'success');

                // Pass to CheckModule
                // Switch to check tab
                this.app.route('check');

                // We need a way to pass these numbers to CheckModule.
                // Option 1: Call a method on CheckModule
                if (this.app.check) {
                    this.app.check.setScannedNumbers(numbers);
                }
            } else {
                // Valid QR but not Lotto? or parse failed
                UIManager.toast('유효한 로또 QR코드가 아닙니다.', 'warning');
            }
        } catch (e) {
            console.error(e);
            UIManager.toast('QR 코드 해석 실패', 'error');
        }
    }

    parseLottoQr(url) {
        // Expected format: http://m.dhlottery.co.kr/?v=0861q020612162843q...

        if (!url || typeof url !== 'string') throw new Error('Invalid URL');

        // Loose check for dhlottery domain
        if (!url.includes('dhlottery')) {
            throw new Error('Not a Lotto 6/45 QR code');
        }

        // Extract 'v' parameter
        let vParam = '';
        try {
            const urlObj = new URL(url);
            vParam = urlObj.searchParams.get('v');
        } catch (e) {
            // Fallback for partial URLs or weird formats
            const match = url.match(/[?&]v=([^&]+)/);
            if (match) vParam = match[1];
        }

        if (!vParam) throw new Error('QR code missing lottery data (v param)');

        // Parse games (separated by 'q')
        // Format: [DrawNo]q[Game1]q[Game2]...
        const parts = vParam.split('q');
        if (parts.length < 2) throw new Error('Invalid data format');

        const games = [];
        for (let i = 1; i < parts.length; i++) {
            const gameStr = parts[i].trim();
            // Need at least 12 digits (6 numbers * 2 chars)
            if (gameStr.length < 12) continue;

            const numsStr = gameStr.substring(0, 12);
            const nums = [];
            // Parse pairs
            for (let j = 0; j < 12; j += 2) {
                const n = parseInt(numsStr.substring(j, j + 2), 10);
                if (!isNaN(n) && n >= 1 && n <= 45) {
                    nums.push(n);
                }
            }

            if (nums.length === 6) {
                nums.sort((a, b) => a - b);
                games.push(nums);
            }
        }

        if (games.length === 0) throw new Error('No valid games found in QR');
        return games;
    }
}
