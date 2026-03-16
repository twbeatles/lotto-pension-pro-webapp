import { $ } from '../utils/utils.js';
import { EXTERNAL_ASSETS, loadScriptOnce } from '../utils/loader.js';

export class UIManager {
    static _ballCache = new Map();

    static toast(msg, type = 'info', duration = 3000) {
        const container = $('#toast-container');
        if (!container) return;

        // aria-live 영역에 메시지를 반영해 스크린 리더가 알림을 읽도록 함
        const liveEl = document.getElementById('toast-live-region');
        if (liveEl) liveEl.textContent = msg;

        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        el.setAttribute('role', 'status');

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
            setTimeout(() => {
                el.remove();
                // 라이브 영역 초기화 (다음 동일 메시지도 감지되도록)
                if (liveEl && liveEl.textContent === msg) liveEl.textContent = '';
            }, 400);
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
        const list = Array.isArray(nums) ? nums : [];
        if (!list.length) return '';

        const key = list.join(',') + '|' + size;
        if (this._ballCache.has(key)) return this._ballCache.get(key);

        const html = list.map(n =>
            `<span class="ball ${this.getBallColor(n)} ${size}">${n}</span>`
        ).join('');

        // LRU 캐시 관리: 1000개 초과 시 가장 오래된 항목부터 제거
        if (this._ballCache.size >= 1000) {
            const iter = this._ballCache.keys();
            for (let i = 0; i < 200; i++) {
                const oldest = iter.next().value;
                if (oldest === undefined) break;
                this._ballCache.delete(oldest);
            }
        }

        this._ballCache.set(key, html);
        return html;
    }

    static formatNumbers(nums) {
        const list = Array.isArray(nums) ? nums : [];
        return list.map(n => String(n).padStart(2, '0')).join(' ');
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
            console.warn('복사 실패', e);
            UIManager.toast('복사 실패', 'error');
        }
    }

    static async showQR(nums) {
        const modal = $('#qrModal');
        const container = $('#qrCanvasContainer');
        if (!modal || !container) return;
        container.innerHTML = '';

        const payload = `로또 6/45\n번호: ${this.formatNumbers(nums)}`;
        try {
            if (!window.QRCode?.toCanvas) {
                await loadScriptOnce(EXTERNAL_ASSETS.qrcode);
            }
            if (!window.QRCode?.toCanvas) throw new Error('큐알 생성 라이브러리를 불러오지 못했습니다.');
            const canvas = document.createElement('canvas');
            container.appendChild(canvas);
            window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 }, (err) => {
                if (err) {
                    console.warn('큐알 렌더링 실패', err);
                    UIManager.toast('큐알 생성 실패', 'error');
                    return;
                }
                modal.classList.add('active');
            });
        } catch (e) {
            console.warn('큐알 처리 오류', e);
            UIManager.toast('큐알 기능을 사용할 수 없습니다.', 'error', 3000);
        }
    }

    static async saveAsImage(element, filename = '로또_결과.png') {
        if (!element) return;
        try {
            if (!window.html2canvas) {
                await loadScriptOnce(EXTERNAL_ASSETS.html2canvas);
            }
            if (!window.html2canvas) throw new Error('이미지 저장 라이브러리를 불러오지 못했습니다.');

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
            console.error('이미지 저장 실패', e);
            UIManager.toast('이미지 저장 실패', 'error');
        }
    }
}
