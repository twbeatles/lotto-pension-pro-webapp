import { $ } from '../../utils/utils.js';
import { EXTERNAL_ASSETS, loadScriptOnce } from '../../utils/loader.js';

export const uiQrModalMethods = {
    _bindQrModalControls() {
        const modal = $('#qrModal');
        if (!modal || modal.dataset.uiBound === 'true') return;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeModal(modal, { reason: 'backdrop' });
            }
        });
        $('#closeQrModalBtn')?.addEventListener('click', () => {
            this.closeModal(modal, { reason: 'close' });
        });

        modal.dataset.uiBound = 'true';
    },

    async showQR(nums) {
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
            canvas.setAttribute('aria-label', '생성된 큐알 코드');
            container.appendChild(canvas);
            window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 }, (err) => {
                if (err) {
                    console.warn('큐알 렌더링 실패', err);
                    this.toast('큐알 생성 실패', 'error');
                    return;
                }
                this.openModal(modal, { initialFocus: $('#closeQrModalBtn') });
            });
        } catch (e) {
            console.warn('큐알 처리 오류', e);
            this.toast('큐알 기능을 사용할 수 없습니다.', 'error', 3000);
        }
    },

    async saveAsImage(element, filename = '로또_결과.png') {
        if (!element) return;
        try {
            if (!window.html2canvas) {
                await loadScriptOnce(EXTERNAL_ASSETS.html2canvas);
            }
            if (!window.html2canvas) throw new Error('이미지 저장 라이브러리를 불러오지 못했습니다.');

            const originalTransform = element.style.transform;
            element.style.transform = 'scale(1.02)';
            await new Promise((resolve) => setTimeout(resolve, 100));

            const canvas = await window.html2canvas(element, {
                backgroundColor: '#1e293b',
                scale: 2,
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

            this.toast('이미지로 저장되었습니다.', 'success');
        } catch (e) {
            console.error('이미지 저장 실패', e);
            this.toast('이미지 저장 실패', 'error');
        }
    }
};
