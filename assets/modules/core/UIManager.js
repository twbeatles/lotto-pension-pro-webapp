import { $ } from '../utils/utils.js';

export class UIManager {
    static toast(msg, type = 'info', duration = 2000) {
        const container = $('#toast-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        container.appendChild(el);

        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            setTimeout(() => el.remove(), 300);
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
        return nums.map(n =>
            `<span class="ball ${this.getBallColor(n)} ${size}">${n}</span>`
        ).join('');
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

    static showQR(nums) {
        const modal = $('#qrModal');
        const container = $('#qrCanvasContainer');
        if (!modal || !container) return;
        container.innerHTML = '';

        const payload = `Lotto 6/45\nNumbers: ${this.formatNumbers(nums)}`;
        try {
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
