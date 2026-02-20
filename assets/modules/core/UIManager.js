import { $ } from '../utils/utils.js';
import { EXTERNAL_ASSETS, loadScriptOnce } from '../utils/loader.js';

export class UIManager {
    static _ballCache = new Map();

    static toast(msg, type = 'info', duration = 3000) {
        const container = $('#toast-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;

        // Premium animation timing
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px) scale(0.95)';
        el.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

        container.appendChild(el);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0) scale(1)';
            });
        });

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(15px) scale(0.98)';
            setTimeout(() => el.remove(), 400);
        }, duration);
    }

    static getBallColor(n) {
        if (n <= 10) return 'yellow';
        if (n <= 20) return 'blue';
        if (n <= 30) return 'red';
        if (n <= 40) return 'gray';
        return 'green';
    }

    static renderBalls(nums, size = '') {
        const key = nums.join(',') + '|' + size;
        if (this._ballCache.has(key)) return this._ballCache.get(key);

        const html = nums.map(n =>
            `<span class="ball ${this.getBallColor(n)} ${size}">${n}</span>`
        ).join('');

        // 캐시 크기 관리 (최대 1000개)
        if (this._ballCache.size > 1000) {
            const firstKey = this._ballCache.keys().next().value;
            this._ballCache.delete(firstKey);
        }

        this._ballCache.set(key, html);
        return html;
    }

    static formatNumbers(nums) {
        return (nums || []).map(n => String(n).padStart(2, '0')).join(' ');
    }

    static async copyNumbers(nums) {
        const text = this.formatNumbers(nums);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for older browsers / non-secure contexts
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            UIManager.toast('복사 완료', 'success');
        } catch (e) {
            console.warn('Copy failed', e);
            UIManager.toast('복사 실패', 'error');
        }
    }

    static async showQR(nums) {
        const modal = $('#qrModal');
        const container = $('#qrCanvasContainer');
        if (!modal || !container) return;
        container.innerHTML = '';

        const payload = `Lotto 6/45\nNumbers: ${this.formatNumbers(nums)}`;
        try {
            if (!window.QRCode?.toCanvas) {
                await loadScriptOnce(EXTERNAL_ASSETS.qrcode);
            }
            if (!window.QRCode?.toCanvas) throw new Error('QRCode library not loaded');
            const canvas = document.createElement('canvas');
            container.appendChild(canvas);
            window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 }, (err) => {
                if (err) {
                    console.warn('QR render failed', err);
                    UIManager.toast('QR 생성 실패', 'error');
                    return;
                }
                modal.classList.add('active');
            });
        } catch (e) {
            console.warn('QR error', e);
            UIManager.toast('QR 기능을 사용할 수 없습니다.', 'error', 3000);
        }
    }

    static async saveAsImage(element, filename = 'lotto_result.png') {
        if (!element) return;
        try {
            if (!window.html2canvas) {
                await loadScriptOnce(EXTERNAL_ASSETS.html2canvas);
            }
            if (!window.html2canvas) throw new Error('html2canvas library not loaded');

            // Visual feedback
            const originalTransform = element.style.transform;
            element.style.transform = 'scale(1.02)';
            await new Promise(r => setTimeout(r, 100)); // micro delay

            const canvas = await window.html2canvas(element, {
                backgroundColor: '#1e293b', // Ensure dark background matches theme or explicit color
                scale: 2, // High res
                logging: false,
                useCORS: true
            });

            element.style.transform = originalTransform;

            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            link.remove();

            UIManager.toast('이미지로 저장되었습니다.', 'success');
        } catch (e) {
            console.error('Image save failed', e);
            UIManager.toast('이미지 저장 실패', 'error');
        }
    }
}
