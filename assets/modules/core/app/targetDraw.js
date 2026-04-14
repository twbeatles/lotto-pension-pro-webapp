import { UIManager } from '../UIManager.js';

export const appTargetDrawMethods = {
    getSuggestedNextDrawNo() {
        const latest = Number(this.data.state.winningStats?.[0]?.draw_no || 0);
        return Math.max(1, Math.floor(latest + 1) || 1);
    },

    setTargetDrawInputValue(id, value, { force = false, userEdited = false } = {}) {
        const el = document.getElementById(id);
        if (!el) return false;

        const nextValue = String(Math.max(1, Math.floor(Number(value) || 1)));
        const currentValue = String(el.value || '').trim();
        const lastAutoValue = String(el.dataset.lastAutoValue || '').trim();
        const autoManaged = el.dataset.userEdited !== 'true' || !currentValue || currentValue === lastAutoValue;

        if (!force && !autoManaged) return false;
        if (currentValue === nextValue && lastAutoValue === nextValue && el.dataset.userEdited === String(userEdited)) {
            return false;
        }

        el.dataset.autoApplying = 'true';
        el.value = nextValue;
        el.dataset.lastAutoValue = nextValue;
        el.dataset.userEdited = userEdited ? 'true' : 'false';
        delete el.dataset.autoApplying;
        return true;
    },

    resetTargetDrawInputs(ids = this.targetDrawInputIds, { toast = true } = {}) {
        const nextDrawNo = this.getSuggestedNextDrawNo();
        let changed = 0;
        (Array.isArray(ids) ? ids : []).forEach((id) => {
            if (this.setTargetDrawInputValue(id, nextDrawNo, { force: true, userEdited: false })) {
                changed++;
            }
        });
        if (toast) {
            UIManager.toast(
                changed > 0 ? '다음 회차 기본값으로 재설정했습니다.' : '이미 다음 회차 기준으로 설정되어 있습니다.',
                changed > 0 ? 'success' : 'info'
            );
        }
        return changed;
    },

    bindTargetDrawInputs() {
        const nextDrawNo = this.getSuggestedNextDrawNo();

        this.targetDrawInputIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;

            if (el.dataset.targetDrawBound !== 'true') {
                const markUserEdited = () => {
                    if (el.dataset.autoApplying === 'true') return;
                    el.dataset.userEdited = 'true';
                };
                el.addEventListener('input', markUserEdited);
                el.addEventListener('change', markUserEdited);
                el.dataset.targetDrawBound = 'true';
            }

            this.setTargetDrawInputValue(id, nextDrawNo, { force: false, userEdited: false });
        });

        document.querySelectorAll('[data-reset-target-draw]').forEach((button) => {
            if (button.dataset.boundResetTargetDraw === 'true') return;
            button.addEventListener('click', () => {
                const ids = String(button.dataset.targetDrawIds || '')
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                this.resetTargetDrawInputs(ids.length ? ids : this.targetDrawInputIds);
            });
            button.dataset.boundResetTargetDraw = 'true';
        });
    }
};
