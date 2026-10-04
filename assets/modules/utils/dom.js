export function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function safeHtml(strings, ...values) {
    return strings.reduce((html, chunk, index) => {
        const escapedValue = index < values.length ? escapeHtml(values[index]) : '';
        return `${html}${chunk}${escapedValue}`;
    }, '');
}

export function setText(element, value = '') {
    if (!element) return;
    element.textContent = String(value ?? '');
}

/**
 * Bring freshly rendered results into view when they start below the fold
 * (mostly on phones, where the form pushes results off-screen).
 */
export function revealResults(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return;
    if (typeof window === 'undefined' || typeof element.scrollIntoView !== 'function') return;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 0;
    if (!viewportHeight || (rect.top >= 0 && rect.top < viewportHeight * 0.7)) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
