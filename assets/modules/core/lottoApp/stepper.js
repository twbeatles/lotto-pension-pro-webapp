export const lottoAppStepperMethods = {
    bindStepperButtons() {
        document.querySelectorAll('[data-step-target]').forEach((button) => {
            if (button.dataset.stepperBound === 'true') return;
            button.addEventListener('click', () => {
                const target = document.getElementById(button.dataset.stepTarget || '');
                const delta = Number(button.dataset.stepDelta || 0);
                if (!target || !Number.isFinite(delta) || delta === 0) return;

                const current = Number(target.value || target.getAttribute('value') || 0);
                const min = Number(target.min || Number.NEGATIVE_INFINITY);
                const max = Number(target.max || Number.POSITIVE_INFINITY);
                const next = Math.min(max, Math.max(min, current + delta));
                target.value = String(next);
                target.dispatchEvent(new Event('change', { bubbles: true }));
            });
            button.dataset.stepperBound = 'true';
        });
    }
};