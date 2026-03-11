import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { EXTERNAL_ASSETS, loadScriptOnce } from '../utils/loader.js';

export class QrScannerModule {
    constructor(app) {
        this.app = app;
        this.scanner = null;
        this.isScanning = false;
        this.bindEvents();
    }

    bindEvents() {
        $('#closeScanBtn')?.addEventListener('click', () => this.stop());
    }

    async destroyScanner() {
        if (!this.scanner) {
            this.isScanning = false;
            return;
        }

        const current = this.scanner;
        this.scanner = null;
        this.isScanning = false;

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
        } catch (err) {
            console.error('스캐너 시작 오류', err);
            UIManager.toast('카메라를 시작할 수 없습니다. 권한을 확인해주세요.', 'error');
            await this.destroyScanner();
            modal.classList.remove('active');
        }
    }

    async stop() {
        const modal = $('#qrScanModal');
        if (modal) modal.classList.remove('active');
        await this.destroyScanner();
    }

    async onScanSuccess(decodedText) {
        // Example format: http://m.dhlottery.co.kr/?v=0861q020612162843q030614182235q121330363842q172930333738q1123283236441316130938
        // Parse logic here
        // Parse logic here
        // console.log(`Scan result: ${decodedText}`);

        try {
            const numbers = this.parseLottoQr(decodedText);
            if (numbers && numbers.length > 0) {
                await this.stop();
                UIManager.toast('큐알 스캔 성공!', 'success');

                // Pass to CheckModule
                // Switch to check tab
                await this.app.route('check');

                // We need a way to pass these numbers to CheckModule.
                // Option 1: Call a method on CheckModule
                if (this.app.check) {
                    this.app.check.setScannedNumbers(numbers);
                }
            } else {
                // Valid QR but not Lotto? or parse failed
                UIManager.toast('유효한 로또 큐알 코드가 아닙니다.', 'warning');
            }
        } catch (e) {
            console.error(e);
            UIManager.toast('큐알 코드 해석 실패', 'error');
        }
    }

    parseLottoQr(url) {
        // Expected format: http://m.dhlottery.co.kr/?v=0861q020612162843q...

        if (!url || typeof url !== 'string') throw new Error('잘못된 주소입니다.');
        const allowedHosts = new Set(['m.dhlottery.co.kr', 'www.dhlottery.co.kr']);
        let host;
        try {
            host = new URL(url).hostname.toLowerCase();
        } catch (e) {
            const hostMatch = String(url).match(/^(?:https?:\/\/)?([^/?#]+)/i);
            host = hostMatch?.[1]?.toLowerCase() || '';
        }

        if (!host || !allowedHosts.has(host)) {
            throw new Error('로또 6/45 공식 큐알 코드가 아닙니다.');
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

        if (!vParam) throw new Error('큐알 코드에 로또 데이터(v 파라미터)가 없습니다.');

        // Parse games (separated by 'q')
        // Format: [DrawNo]q[Game1]q[Game2]...
        const parts = vParam.split('q');
        if (parts.length < 2) throw new Error('데이터 형식이 올바르지 않습니다.');

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

            if (nums.length === 6 && new Set(nums).size === 6) {
                nums.sort((a, b) => a - b);
                games.push(nums);
            }
        }

        if (games.length === 0) throw new Error('큐알 코드에서 유효한 게임을 찾을 수 없습니다.');
        return games;
    }
}
