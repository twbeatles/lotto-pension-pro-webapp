import { CONFIG } from '../utils/config.js';
import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

export class GeneratorModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.bindEvents();
    }

    bindEvents() {
        const btn = $('#generateBtn');
        if (btn) btn.addEventListener('click', () => this.generate());

        const resetBtn = $('#resetOptions');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetOptions());

        const clearBtn = $('#clearResults');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            $('#genResultList').innerHTML = '';
            this.data.state.generated = [];
        });

        const saveAllBtn = $('#saveAllBtn');
        if (saveAllBtn) saveAllBtn.addEventListener('click', () => this.saveAll());
    }

    resetOptions() {
        $('#setCount').value = 5;
        $('#fixedNums').value = '';
        $('#excludeNums').value = '';
        $('#limitConsecutive').checked = true;
        $('#smartMode').checked = true;
        $('#preferHot').checked = true;
        $('#balanceMode').checked = true;
        UIManager.toast('옵션이 초기화되었습니다.');
    }

    generate() {
        const count = Number($('#setCount').value) || 5;
        const fixed = this.parseInput($('#fixedNums').value);
        const exclude = this.parseInput($('#excludeNums').value);

        if (fixed.length > CONFIG.LIMITS.MAX_FIXED) {
            return UIManager.toast(`고정수는 최대 ${CONFIG.LIMITS.MAX_FIXED}개입니다.`, 'error');
        }

        const options = {
            fixed,
            exclude,
            smart: $('#smartMode').checked,
            hot: $('#preferHot').checked,
            cold: false,
            balance: $('#balanceMode').checked,
            limitConsecutive: $('#limitConsecutive').checked
        };
        options.cold = options.smart && !options.hot;

        const listEl = $('#genResultList');
        listEl.innerHTML = '';
        this.data.state.generated = [];

        // Freq map for smart weighting (hot/cold)
        const freq = {};
        if (options.smart) {
            this.data.state.winningStats.forEach(w => w.numbers.forEach(n => freq[n] = (freq[n] || 0) + 1));
        }
        const maxFreq = Math.max(...Object.values(freq), 1);

        for (let i = 0; i < count; i++) {
            const nums = this.createSet(options, freq, maxFreq);
            if (nums) {
                this.data.state.generated.push(nums);
                this.renderResultItem(nums, i, listEl);
            }
        }
    }

    parseInput(val) {
        return [...new Set(val.split(/[^0-9]+/).filter(Boolean).map(Number).filter(n => n >= 1 && n <= 45))];
    }

    createSet(opts, freq, maxFreq) {
        let attempts = 0;
        while (attempts++ < 100) {
            let pool = Array.from({ length: 45 }, (_, i) => i + 1)
                .filter(n => !opts.exclude.includes(n) && !opts.fixed.includes(n));

            // Apply smart weighting (Hot or Cold)
            if (opts.smart && (opts.hot || opts.cold)) {
                const weightedPool = [];
                pool.forEach(n => {
                    const c = (freq[n] || 0);
                    const ratio = opts.hot
                        ? (c / maxFreq)
                        : ((maxFreq - c) / maxFreq);
                    const w = Math.floor(ratio * 5) + 1; // 1~6
                    for (let k = 0; k < w; k++) weightedPool.push(n);
                });
                pool = weightedPool;
            }

            const current = [...opts.fixed];
            while (current.length < 6 && pool.length > 0) {
                const pick = pool[Math.floor(Math.random() * pool.length)];
                if (!current.includes(pick)) current.push(pick);
            }

            if (current.length < 6) continue;
            current.sort((a, b) => a - b);

            // Filters
            if (opts.limitConsecutive) {
                let cons = 0;
                for (let k = 0; k < 5; k++) if (current[k + 1] === current[k] + 1) cons++;
                if (cons >= 2) continue;
            }

            if (opts.balance) {
                const odd = current.filter(n => n % 2).length;
                if (odd < 2 || odd > 4) continue;
                const high = current.filter(n => n > 23).length;
                if (high < 2 || high > 4) continue;
            }

            return current;
        }
        // Fallback random if filtering too strict
        return this.createRandomSet(opts);
    }

    createRandomSet(opts) {
        let pool = Array.from({ length: 45 }, (_, i) => i + 1)
            .filter(n => !opts.exclude.includes(n) && !opts.fixed.includes(n));
        const current = [...opts.fixed];
        while (current.length < 6 && pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            current.push(pool[idx]);
            pool.splice(idx, 1);
        }
        return current.sort((a, b) => a - b);
    }

    renderResultItem(nums, index, container) {
        const el = document.createElement('div');
        el.className = 'result-item';
        el.innerHTML = `
            <div class="result-balls ball-container">${UIManager.renderBalls(nums)}</div>
            <div class="result-actions">
                <button class="icon-btn copy-btn" title="복사"><i class="ph ph-copy"></i></button>
                <button class="icon-btn qr-btn" title="QR"><i class="ph ph-qr-code"></i></button>
                <button class="icon-btn share-btn" title="이미지 저장"><i class="ph ph-download-simple"></i></button>
                <button class="icon-btn fav-btn" title="즐겨찾기"><i class="ph ph-star"></i></button>
            </div>
        `;

        // Event Delegation friendly, or direct bind
        el.querySelector('.copy-btn').onclick = () => UIManager.copyNumbers(nums);
        el.querySelector('.qr-btn').onclick = () => UIManager.showQR(nums);
        el.querySelector('.share-btn').onclick = () => UIManager.saveAsImage(el, `lotto_gen_${index + 1}.png`);
        el.querySelector('.fav-btn').onclick = () => {
            this.app.data.addToFavorites(nums);
            // We might need to refresh data lists if the app is exposed or if we trigger an event
            if (this.app.renderDataLists) this.app.renderDataLists();
        };

        // Animation
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 80);

        container.appendChild(el);
    }

    saveAll() {
        if (!this.data.state.generated.length) return;
        let count = 0;
        this.data.state.generated.forEach(nums => {
            // Check History dupes
            const key = nums.join(',');
            if (!this.data.state.history.some(h => h.numbers.join(',') === key)) {
                this.data.state.history.unshift({ numbers: nums, date: new Date().toISOString() });
                count++;
            }
        });
        if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
            this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
        }
        this.data.save();
        UIManager.toast(`${count}개 세트 히스토리 저장 완료`, 'success');
        if (this.app.renderDataLists) this.app.renderDataLists();
    }
}
