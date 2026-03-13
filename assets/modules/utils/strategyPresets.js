import { UIManager } from '../core/UIManager.js';
import { $ } from './utils.js';

export class StrategyPresetController {
    constructor({
        data,
        scope,
        selectId,
        loadBtnId,
        saveBtnId,
        deleteBtnId,
        getRequest,
        applyRequest
    }) {
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
        this.saveBtnEl?.addEventListener('click', () => this.saveCurrent());
        this.deleteBtnEl?.addEventListener('click', () => this.deleteSelected());
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
        this.data.save();
        this.render(preset.id);
        UIManager.toast(`'${preset.name}' 프리셋을 불러왔습니다.`, 'success');
    }

    saveCurrent() {
        if (typeof this.getRequest !== 'function') return;
        const request = this.getRequest();
        if (!request) {
            UIManager.toast('현재 전략 설정을 읽지 못했습니다.', 'error');
            return;
        }

        const rawName = window.prompt?.('프리셋 이름을 입력하세요.');
        if (rawName == null) return;
        const name = String(rawName).trim();
        if (!name) {
            UIManager.toast('프리셋 이름을 입력하세요.', 'warning');
            return;
        }

        const existing = this.data.findStrategyPreset(this.scope, name);
        if (existing && !window.confirm?.(`'${name}' 프리셋을 덮어쓸까요?`)) return;

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

    deleteSelected() {
        const preset = this.getSelectedPreset();
        if (!preset) return;
        if (!window.confirm?.(`'${preset.name}' 프리셋을 삭제할까요?`)) return;
        const removed = this.data.deleteStrategyPreset(preset.id);
        if (!removed) {
            UIManager.toast('프리셋 삭제에 실패했습니다.', 'error');
            return;
        }
        this.render();
        UIManager.toast(`'${preset.name}' 프리셋을 삭제했습니다.`, 'success');
    }
}
