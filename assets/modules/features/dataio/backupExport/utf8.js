export function getUtf8ByteLength(value = '') {
    const text = String(value || '');
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
}