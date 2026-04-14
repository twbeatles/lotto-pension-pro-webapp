export const uiBallMethods = {
    getBallColor(n) {
        if (n <= 10) return 'yellow';
        if (n <= 20) return 'blue';
        if (n <= 30) return 'red';
        if (n <= 40) return 'gray';
        return 'green';
    },

    renderBalls(nums, size = '') {
        const list = Array.isArray(nums) ? nums : [];
        if (!list.length) return '';

        const key = `${list.join(',')}|${size}`;
        if (this._ballCache.has(key)) return this._ballCache.get(key);

        const html = list.map((n) => (
            `<span class="ball ${this.getBallColor(n)} ${size}" role="img" aria-label="${n}번 번호" title="${n}번 번호">${n}</span>`
        )).join('');

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
    },

    formatNumbers(nums) {
        const list = Array.isArray(nums) ? nums : [];
        return list.map((n) => String(n).padStart(2, '0')).join(' ');
    },

    async copyNumbers(nums) {
        const text = this.formatNumbers(nums);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            this.toast('복사 완료', 'success');
        } catch (e) {
            console.warn('복사 실패', e);
            this.toast('복사 실패', 'error');
        }
    }
};
