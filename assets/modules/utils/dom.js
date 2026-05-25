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
