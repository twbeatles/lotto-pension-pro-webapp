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
        console.log(`Scan result: ${decodedText}`);

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
        // dhlottery URL format: .../?v=TIMEOUT_NUMBERS...
        // Numbers section: "q" + 12 digits per game (6 nums * 2 digits)
        // Actually the format is complicated.
        // Example: http://m.dhlottery.co.kr/?v=0861q020612162843q...
        // 0861 = draw no?
        // q = separator
        // 020612162843 = 02 06 12 16 28 43

        if (!url.includes('dhlottery.co.kr')) {
            throw new Error('Not a generic Lotto URL');
        }

        const params = new URLSearchParams(new URL(url).search);
        const v = params.get('v');
        if (!v) throw new Error('No data found');

        const parts = v.split('q');
        // parts[0] contains draw number mixed with other things?
        // Actually parts[0] is usually DrawNo + "m" + something?
        // Let's assume standard format v=DRWNOqNUMS...
        // Actually, looking at examples online: v=0861q020612162843...
        // The first part `0861` is the draw number.
        // Subsequent parts starting with `q` are games.

        // Let's extract all games.
        const games = [];
        // Skip the first part (draw info)
        for (let i = 1; i < parts.length; i++) {
            const gameStr = parts[i];
            // Take first 12 chars
            const numsStr = gameStr.substring(0, 12);
            const nums = [];
            for (let j = 0; j < 12; j += 2) {
                nums.push(Number(numsStr.substring(j, j + 2)));
            }
            games.push(nums);
        }

        if (games.length === 0) throw new Error('No games found');

        // For now, let's just use the first game or ask user?
        // Or return all games?
        // The CheckModule usually checks ONE ticket (set of 6 numbers).
        // If the QR has multiple games, we might want to check them all.
        // But CheckModule currently UI compares one set.
        // Let's return the first set for now, or handle multiple.

        // Better: Allow CheckModule to handle a list of sets.
        // But `CheckModule` logic `run()` compares `this.getList()[idx]`.
        // I should probably modify `CheckModule` to allow "Scanned Ticket" mode.

        return games;
    }
}
