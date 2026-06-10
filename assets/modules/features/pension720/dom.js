const PENSION720_ANALYSIS_PRESETS = {
    fast: {
        label: '??',
        lookbackWindow: 20,
        candidatePoolSize: 80
    },
    basic: {
        label: '??',
        lookbackWindow: 40,
        candidatePoolSize: 140
    },
    precise: {
        label: '??',
        lookbackWindow: 80,
        candidatePoolSize: 240
    }
};

function clearElement(el) {
    if (el) el.replaceChildren();
}

function makeEl(tag, className = '', text = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function appendDigitBalls(container, number, options = {}) {
    const wrap = makeEl('div', 'p720-number');
    if (options.group) {
        const group = makeEl('span', 'p720-ball p720-group', String(options.group) + '?');
        wrap.appendChild(group);
    }
    String(number || '')
        .split('')
        .forEach((digit) => {
            wrap.appendChild(makeEl('span', 'p720-ball', digit));
        });
    container.appendChild(wrap);
    return wrap;
}

function formatDate(date = '') {
    return String(date || '').replaceAll('-', '.');
}

function formatTicket(ticket) {
    return `${Number(ticket?.group || 0)}? ${String(ticket?.number || '').padStart(6, '0')}`;
}

function getCheckSortValue(result) {
    if (!result) return 99;
    if (result.rank === 'bonus') return 2.5;
    return result.rank ? Number(result.rank) : 99;
}

function getTargetAwareCheckSortValue(item) {
    const statusOrder = {
        target: 0,
        reference: 20,
        pending: 40,
        missing: 45
    };
    return (statusOrder[item?.status] ?? 50) + getCheckSortValue(item?.result);
}

function getAnalysisPresetLabelFromRequest(request = {}) {
    const lookbackWindow = Number(request.params?.lookbackWindow || 0);
    const candidatePoolSize = Number(request.params?.candidatePoolSize || 0);
    const matched = Object.values(PENSION720_ANALYSIS_PRESETS).find((preset) => {
        return preset.lookbackWindow === lookbackWindow && preset.candidatePoolSize === candidatePoolSize;
    });
    return matched?.label || '??';
}

export {
    appendDigitBalls,
    clearElement,
    formatDate,
    formatTicket,
    getAnalysisPresetLabelFromRequest,
    getTargetAwareCheckSortValue,
    makeEl,
    PENSION720_ANALYSIS_PRESETS
};
