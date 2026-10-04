import { UIManager } from '../core/UIManager.js';
import { hasExplicitSeed } from '../core/strategy/runtimeEntropy.js';

export function resolveDisplayedReproductionSeed(request = {}, runtimeSeed = null) {
    if (hasExplicitSeed(request)) {
        return Math.floor(Number(request.params.seed));
    }
    const seed = Number(runtimeSeed);
    return Number.isFinite(seed) ? Math.floor(seed) : null;
}

export function upsertReproductionCodeBar({ host, barId, seed, request = null } = {}) {
    if (!host) return null;

    const displayedSeed = resolveDisplayedReproductionSeed(request, seed);
    let bar = host.querySelector(`#${barId}`);

    if (!Number.isFinite(displayedSeed)) {
        bar?.remove();
        return null;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.id = barId;
        bar.className = 'reproduction-code-bar';
        // Keep card headers on top: place the bar right above the result list when the host has one.
        const anchor = host.querySelector?.(':scope > .result-list') || host.firstChild;
        host.insertBefore(bar, anchor);
    }

    bar.replaceChildren();
    const label = document.createElement('span');
    label.className = 'reproduction-code-label';
    label.textContent = '재현 코드';
    const code = document.createElement('code');
    code.className = 'reproduction-code-value';
    code.textContent = String(displayedSeed);
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn ghost sm';
    copyBtn.textContent = '복사';
    copyBtn.addEventListener('click', () => {
        UIManager.copyText(String(displayedSeed));
    });
    const help = document.createElement('p');
    help.className = 'field-help';
    help.textContent = hasExplicitSeed(request)
        ? '입력한 코드로 만든 결과예요.'
        : '세부 조건의 「같은 번호 다시 만들기 코드」 칸에 넣으면 같은 결과가 나와요.';
    bar.append(label, code, copyBtn, help);
    return bar;
}