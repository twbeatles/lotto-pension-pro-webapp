// Small confetti burst for real wins. canvas-confetti (ISC) is vendored and loaded lazily
// so it never costs anything until a ticket actually wins.
const CONFETTI_MODULE = '../../vendor/canvas-confetti/confetti.module.js';
const BALL_COLORS = ['#f6b417', '#3b82f6', '#ef4444', '#7c8597', '#22b573'];

let confettiPromise = null;

function prefersReducedMotion() {
    try {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch (_e) {
        return false;
    }
}

export async function celebrateWin({ rank = 5 } = {}) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (prefersReducedMotion()) return false;
    try {
        if (!confettiPromise) {
            confettiPromise = import(CONFETTI_MODULE).then((mod) => mod.default || mod);
        }
        const confetti = await confettiPromise;
        if (typeof confetti !== 'function') return false;
        const big = Number(rank) > 0 && Number(rank) <= 3;
        confetti({
            particleCount: big ? 180 : 90,
            spread: big ? 110 : 75,
            startVelocity: big ? 45 : 35,
            origin: { y: 0.65 },
            colors: BALL_COLORS,
            disableForReducedMotion: true,
            zIndex: 10002
        });
        return true;
    } catch (_e) {
        confettiPromise = null;
        return false;
    }
}
