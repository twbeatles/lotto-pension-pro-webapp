import { UIManager } from '../core/UIManager.js';
import { $ } from './utils.js';
import { UI_STRINGS } from './strings.js';

export class StrategyPresetController {
    constructor({ data, scope, selectId, loadBtnId, saveBtnId, deleteBtnId, getRequest, applyRequest }) {
        this.data = data;
        this.scope = scope;
        this.selectId = selectId;
        this.loadBtnId = loadBtnId;
        this.saveBtnId = saveBtnId;
        this.deleteBtnId = deleteBtnId;
        this.getRequest = getRequest;
        this.applyRequest = applyRequest;
        this.bindEvents();
        this.render();
    }

    get selectEl() {
        return $(`#${this.selectId}`);
    }

    get loadBtnEl() {
        return $(`#${this.loadBtnId}`);
    }

    get saveBtnEl() {
        return $(`#${this.saveBtnId}`);
    }

    get deleteBtnEl() {
        return $(`#${this.deleteBtnId}`);
    }

    getSelectedPreset() {
        const id = String(this.selectEl?.value || '').trim();
        if (!id) return null;
        return this.data.getStrategyPresetById(id);
    }

    bindEvents() {
        this.selectEl?.addEventListener('change', () => this.syncButtons());
        this.loadBtnEl?.addEventListener('click', () => this.loadSelected());
        this.saveBtnEl?.addEventListener('click', () => {
            void this.saveCurrent();
        });
        this.deleteBtnEl?.addEventListener('click', () => {
            void this.deleteSelected();
        });
        this.syncButtons();
    }

    syncButtons() {
        const hasPreset = Boolean(this.getSelectedPreset());
        if (this.loadBtnEl) this.loadBtnEl.disabled = !hasPreset;
        if (this.deleteBtnEl) this.deleteBtnEl.disabled = !hasPreset;
        if (this.saveBtnEl) this.saveBtnEl.disabled = typeof this.getRequest !== 'function';
    }

    render(selectedId = '') {
        const select = this.selectEl;
        if (!select) return;

        const presets = this.data.getStrategyPresets(this.scope);
        const preferred = String(selectedId || select.value || '').trim();

        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = presets.length ? '저장된 프리셋 선택' : '저장된 프리셋 없음';
        select.appendChild(placeholder);

        presets.forEach((preset) => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name;
            select.appendChild(option);
        });

        if (preferred && presets.some((preset) => preset.id === preferred)) {
            select.value = preferred;
        } else {
            select.value = '';
        }
        this.syncButtons();
    }

    loadSelected() {
        const preset = this.getSelectedPreset();
        if (!preset) return;
        this.applyRequest?.(preset.request);
        this.data.setStrategyPrefs(this.scope, preset.request);
        this.data.save(true);
        this.render(preset.id);
        UIManager.toast(`'${preset.name}' 프리셋을 불러왔습니다.`, 'success');
    }

    async saveCurrent() {
        if (typeof this.getRequest !== 'function') return;
        const request = this.getRequest();
        if (!request) {
            UIManager.toast('현재 전략 설정을 읽지 못했습니다.', 'error');
            return;
        }

        const rawName = await UIManager.prompt({
            title: UI_STRINGS.presets.promptTitle,
            message: UI_STRINGS.presets.promptMessage,
            placeholder: '예: 최근 20회 보수형'
        });
        if (rawName == null) return;
        const name = String(rawName).trim();
        if (!name) {
            UIManager.toast('프리셋 이름을 입력하세요.', 'warning');
            return;
        }

        const existing = this.data.findStrategyPreset(this.scope, name);
        if (existing) {
            const confirmed = await UIManager.confirm({
                title: UI_STRINGS.presets.overwriteTitle(name),
                message: `'${name}' 이름으로 저장된 프리셋이 있습니다. 현재 설정으로 덮어씁니다.`
            });
            if (!confirmed) return;
        }

        const saved = this.data.saveStrategyPreset(this.scope, name, request);
        if (!saved?.preset) {
            UIManager.toast('프리셋 저장에 실패했습니다.', 'error');
            return;
        }

        this.render(saved.preset.id);
        UIManager.toast(
            saved.replaced ? `'${name}' 프리셋을 덮어썼습니다.` : `'${name}' 프리셋을 저장했습니다.`,
            'success'
        );
    }

    async deleteSelected() {
        const preset = this.getSelectedPreset();
        if (!preset) return;
        const confirmed = await UIManager.confirm({
            title: UI_STRINGS.presets.deleteTitle(preset.name),
            message: '삭제한 프리셋은 되돌릴 수 없습니다.'
        });
        if (!confirmed) return;
        const removed = this.data.deleteStrategyPreset(preset.id);
        if (!removed) {
            UIManager.toast('프리셋 삭제에 실패했습니다.', 'error');
            return;
        }
        this.render();
        UIManager.toast(`'${preset.name}' 프리셋을 삭제했습니다.`, 'success');
    }
}
