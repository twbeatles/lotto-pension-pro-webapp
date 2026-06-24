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
        bar.className = 'reproduction-code-bar card glass sm';
        host.insertBefore(bar, host.firstChild);
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
        ? '입력한 코드로 같은 번호를 다시 만들 수 있습니다.'
        : '이 코드를 "같은 번호 다시 만들기" 입력란에 넣으면 같은 결과를 재현할 수 있습니다.';
    bar.append(label, code, copyBtn, help);
    return bar;
}