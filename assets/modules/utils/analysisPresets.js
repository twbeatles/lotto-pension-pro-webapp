export const ANALYSIS_PRESETS = {
    fast: {
        label: '빠름',
        simulationCount: 2000,
        lookbackWindow: 12
    },
    basic: {
        label: '기본',
        simulationCount: 5000,
        lookbackWindow: 20
    },
    precise: {
        label: '정밀',
        simulationCount: 12000,
        lookbackWindow: 40
    }
};

export function getAnalysisPreset(id = 'basic') {
    return ANALYSIS_PRESETS[id] || ANALYSIS_PRESETS.basic;
}

export function applyAnalysisPresetToFields(prefix, presetId = 'basic') {
    const preset = getAnalysisPreset(presetId);
    const simulation = document.getElementById(`${prefix}SimulationCount`);
    const lookback = document.getElementById(`${prefix}LookbackWindow`);
    const select = document.getElementById(`${prefix}AnalysisPreset`);

    if (simulation) simulation.value = String(preset.simulationCount);
    if (lookback) lookback.value = String(preset.lookbackWindow);
    if (select) select.value = ANALYSIS_PRESETS[presetId] ? presetId : 'basic';
    return preset;
}

export function inferAnalysisPresetFromFields(prefix) {
    const simulation = Number(document.getElementById(`${prefix}SimulationCount`)?.value || 0);
    const lookback = Number(document.getElementById(`${prefix}LookbackWindow`)?.value || 0);
    const matched = Object.entries(ANALYSIS_PRESETS).find(([, preset]) => {
        return preset.simulationCount === simulation && preset.lookbackWindow === lookback;
    });
    return matched?.[0] || 'custom';
}

export function syncAnalysisPresetSelect(prefix) {
    const select = document.getElementById(`${prefix}AnalysisPreset`);
    if (!select) return 'custom';
    const presetId = inferAnalysisPresetFromFields(prefix);
    select.value = presetId === 'custom' ? 'custom' : presetId;
    return presetId;
}
