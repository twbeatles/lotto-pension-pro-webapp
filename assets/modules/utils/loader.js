const scriptPromises = new Map();
const stylePromises = new Map();

export const EXTERNAL_ASSETS = {
    qrcode: './assets/vendor/qrcode/qrcode.min.js',
    html5QrCode: './assets/vendor/html5-qrcode/html5-qrcode.min.js',
    html2canvas: './assets/vendor/html2canvas/html2canvas.min.js',
    phosphor: {
        thin: './assets/vendor/phosphor/src/thin/style.css',
        light: './assets/vendor/phosphor/src/light/style.css',
        duotone: './assets/vendor/phosphor/src/duotone/style.css'
    }
};

export function loadScriptOnce(src, attrs = {}) {
    if (!src) return Promise.reject(new Error('script src is required'));
    if (scriptPromises.has(src)) return scriptPromises.get(src);

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') return Promise.resolve(existing);

    const promise = new Promise((resolve, reject) => {
        const el = existing || document.createElement('script');
        if (!existing) {
            el.src = src;
            el.async = attrs.async ?? true;
            if (attrs.defer != null) el.defer = attrs.defer;
            if (attrs.crossOrigin) el.crossOrigin = attrs.crossOrigin;
            if (attrs.referrerPolicy) el.referrerPolicy = attrs.referrerPolicy;
            document.head.appendChild(el);
        }

        const onLoad = () => {
            el.dataset.loaded = 'true';
            el.removeEventListener('load', onLoad);
            el.removeEventListener('error', onError);
            resolve(el);
        };
        const onError = () => {
            el.removeEventListener('load', onLoad);
            el.removeEventListener('error', onError);
            scriptPromises.delete(src);
            reject(new Error(`failed to load script: ${src}`));
        };

        el.addEventListener('load', onLoad);
        el.addEventListener('error', onError);
    });

    scriptPromises.set(src, promise);
    return promise;
}

export function loadStyleOnce(href) {
    if (!href) return Promise.reject(new Error('style href is required'));
    if (stylePromises.has(href)) return stylePromises.get(href);

    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing?.dataset.loaded === 'true') return Promise.resolve(existing);

    const promise = new Promise((resolve, reject) => {
        const el = existing || document.createElement('link');
        if (!existing) {
            el.rel = 'stylesheet';
            el.href = href;
            document.head.appendChild(el);
        }

        const onLoad = () => {
            el.dataset.loaded = 'true';
            el.removeEventListener('load', onLoad);
            el.removeEventListener('error', onError);
            resolve(el);
        };
        const onError = () => {
            el.removeEventListener('load', onLoad);
            el.removeEventListener('error', onError);
            stylePromises.delete(href);
            reject(new Error(`failed to load style: ${href}`));
        };

        el.addEventListener('load', onLoad);
        el.addEventListener('error', onError);
    });

    stylePromises.set(href, promise);
    return promise;
}

export function runWhenIdle(task, timeout = 1200) {
    if (typeof task !== 'function') return;
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => task(), { timeout });
    } else {
        setTimeout(() => task(), 300);
    }
}

