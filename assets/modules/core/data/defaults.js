import { $ } from '../../utils/utils.js';
import { createDefaultStrategyRequest } from '../StrategyCatalog.js';
export const dataDefaultsMethods = {
    markDirty(...keys) {
        keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(this._dirtyKeys, key)) {
                this._dirtyKeys[key] = true;
            }
        });
    },

    markAllDirty() {
        Object.keys(this._dirtyKeys).forEach((key) => {
            this._dirtyKeys[key] = true;
        });
    },

    getDefaultStrategyPrefs() {
        return {
            generator: createDefaultStrategyRequest('ensemble_weighted'),
            ai: createDefaultStrategyRequest('ensemble_weighted'),
            backtest: createDefaultStrategyRequest('random_baseline')
        };
    },

    getDefaultAlertPrefs() {
        return {
            enableInApp: true,
            enableSystemNotification: false,
            notifyOnNewResult: true
        };
    },

    getDefaultSyncMeta() {
        return {
            mode: 'automatic_fallback',
            currentSource: '기본 자동 동기화',
            lastSuccessAt: '',
            lastSuccessDrawNo: 0,
            lastFailureAt: '',
            lastFailureMessage: '',
            lastWarningAt: '',
            lastWarningMessage: ''
        };
    },

    getDefaultDataHealth() {
        return {
            availability: 'none',
            source: 'none',
            latestDrawNo: 0,
            message: ''
        };
    },

    mergeDataHealth(raw) {
        const defaults = this.getDefaultDataHealth();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            availability: ['full', 'partial', 'none'].includes(input.availability)
                ? input.availability
                : defaults.availability,
            source: ['static', 'static_local', 'local_only', 'none'].includes(input.source)
                ? input.source
                : defaults.source,
            latestDrawNo: Math.max(0, Math.floor(Number(input.latestDrawNo || 0))),
            message: typeof input.message === 'string' ? input.message.slice(0, 240) : defaults.message
        };
    },

    setDataHealth(next = {}) {
        this.dataHealth = this.mergeDataHealth({
            ...(this.dataHealth || this.getDefaultDataHealth()),
            ...(next || {})
        });
        this.app?.renderSettingsPanel?.();
        return this.dataHealth;
    },

    getDataHealthSourceLabel(source = this.dataHealth?.source) {
        if (source === 'static') return '정적 JSON';
        if (source === 'static_local') return '정적 JSON + 로컬 업데이트';
        if (source === 'local_only') return '로컬 업데이트만';
        return '데이터 없음';
    },

    getLocalRestoreSourceLabel(source = this.dataHealth?.source) {
        return `로컬 복원 (${this.getDataHealthSourceLabel(source)})`;
    },

    mergeSyncMeta(raw) {
        const defaults = this.getDefaultSyncMeta();
        const input = raw && typeof raw === 'object' ? raw : {};
        const lastSuccessDrawNo = Math.max(0, Math.floor(Number(input.lastSuccessDrawNo || 0)));
        return {
            mode: typeof input.mode === 'string' && input.mode.trim() ? input.mode.trim() : defaults.mode,
            currentSource: typeof input.currentSource === 'string' && input.currentSource.trim()
                ? input.currentSource.trim()
                : defaults.currentSource,
            lastSuccessAt: typeof input.lastSuccessAt === 'string' ? input.lastSuccessAt : defaults.lastSuccessAt,
            lastSuccessDrawNo,
            lastFailureAt: typeof input.lastFailureAt === 'string' ? input.lastFailureAt : defaults.lastFailureAt,
            lastFailureMessage: typeof input.lastFailureMessage === 'string'
                ? input.lastFailureMessage.slice(0, 240)
                : defaults.lastFailureMessage,
            lastWarningAt: typeof input.lastWarningAt === 'string' ? input.lastWarningAt : defaults.lastWarningAt,
            lastWarningMessage: typeof input.lastWarningMessage === 'string'
                ? input.lastWarningMessage.slice(0, 240)
                : defaults.lastWarningMessage
        };
    },

    getSyncMode(proxyConfig = this.resolveProxyConfig()) {
        return proxyConfig?.url ? 'custom_proxy' : 'automatic_fallback';
    },

    getSyncModeLabel(mode = this.state.syncMeta?.mode) {
        if (mode === 'local_restore') return '로컬 복원';
        if (mode === 'local_restore_failed') return '로컬 복원 실패';
        if (mode === 'custom_proxy' || mode === 'proxy_opt_in') return '사용자 프록시';
        if (mode === 'automatic_fallback') return '기본 자동 동기화';
        return '정적 JSON 전용';
    },

    getSyncSourceLabel(proxyConfig = this.resolveProxyConfig()) {
        if (proxyConfig?.url) return proxyConfig.source || '사용자 프록시';
        return '기본 자동 동기화';
    },

    isStrategyScope(scope) {
        return ['generator', 'ai', 'backtest'].includes(String(scope || '').trim());
    },

    mergeStrategyPrefs(raw) {
        const defaults = this.getDefaultStrategyPrefs();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            generator: {
                ...defaults.generator,
                ...(input.generator || {}),
                params: { ...defaults.generator.params, ...(input.generator?.params || {}) },
                filters: { ...defaults.generator.filters, ...(input.generator?.filters || {}) }
            },
            ai: {
                ...defaults.ai,
                ...(input.ai || {}),
                params: { ...defaults.ai.params, ...(input.ai?.params || {}) },
                filters: { ...defaults.ai.filters, ...(input.ai?.filters || {}) }
            },
            backtest: {
                ...defaults.backtest,
                ...(input.backtest || {}),
                params: { ...defaults.backtest.params, ...(input.backtest?.params || {}) },
                filters: { ...defaults.backtest.filters, ...(input.backtest?.filters || {}) }
            }
        };
    },

    mergeAlertPrefs(raw) {
        const defaults = this.getDefaultAlertPrefs();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            ...defaults,
            ...input,
            enableInApp: input.enableInApp !== false,
            enableSystemNotification: Boolean(input.enableSystemNotification),
            notifyOnNewResult: input.notifyOnNewResult !== false
        };
    },

    mergeStrategyPresets(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const byId = new Map();
        const byScopeName = new Set();

        list.forEach((item, index) => {
            if (!item || typeof item !== 'object') return;
            const scope = typeof item.scope === 'string' ? item.scope.trim() : '';
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            const request = item.request && typeof item.request === 'object'
                ? item.request
                : (item.strategyRequest && typeof item.strategyRequest === 'object' ? item.strategyRequest : null);
            if (!scope || !name || !request) return;
            if (!this.isStrategyScope(scope)) return;

            const normalizedRequest = this.normalizeStrategyPresetRequest(scope, request);
            if (!normalizedRequest) return;

            const id = (typeof item.id === 'string' && item.id.trim())
                ? item.id.trim()
                : `preset_${scope}_${name}_${index}`;
            const scopeNameKey = `${scope}|${name}`;
            if (byId.has(id) || byScopeName.has(scopeNameKey)) return;

            byId.set(id, {
                id,
                scope,
                name,
                description: typeof item.description === 'string' ? item.description.slice(0, 200) : '',
                request: normalizedRequest,
                createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
                updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
            });
            byScopeName.add(scopeNameKey);
        });

        return Array.from(byId.values());
    },

    normalizeStrategyPresetRequest(scope, request) {
        if (!this.isStrategyScope(scope)) return null;
        if (!request || typeof request !== 'object') return null;
        const merged = this.mergeStrategyPrefs({ [scope]: request });
        return merged[scope] || null;
    },

    getStrategyPresets(scope = '') {
        const targetScope = String(scope || '').trim();
        const list = this.mergeStrategyPresets(this.state.strategyPresets || []);
        const filtered = targetScope
            ? list.filter((item) => item.scope === targetScope)
            : list;
        return filtered.sort((a, b) => {
            const byUpdated = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
            if (byUpdated !== 0) return byUpdated;
            const byCreated = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            if (byCreated !== 0) return byCreated;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
        });
    },

    getStrategyPresetById(id) {
        if (!id) return null;
        return this.getStrategyPresets().find((item) => item.id === id) || null;
    },

    findStrategyPreset(scope, name) {
        const targetScope = String(scope || '').trim();
        const targetName = String(name || '').trim();
        if (!targetScope || !targetName) return null;
        return this.getStrategyPresets(targetScope).find((item) => item.name === targetName) || null;
    },

    saveStrategyPreset(scope, name, request, description = '') {
        const normalizedScope = String(scope || '').trim();
        const normalizedName = String(name || '').trim().slice(0, 80);
        const normalizedRequest = this.normalizeStrategyPresetRequest(normalizedScope, request);
        if (!this.isStrategyScope(normalizedScope) || !normalizedName || !normalizedRequest) return null;

        const existing = this.findStrategyPreset(normalizedScope, normalizedName);
        const now = new Date().toISOString();
        const nextPreset = existing
            ? {
                ...existing,
                description: String(description || existing.description || '').slice(0, 200),
                request: normalizedRequest,
                updatedAt: now
            }
            : {
                id: this.createId('preset'),
                scope: normalizedScope,
                name: normalizedName,
                description: String(description || '').slice(0, 200),
                request: normalizedRequest,
                createdAt: now,
                updatedAt: now
            };

        const remaining = (this.state.strategyPresets || []).filter((item) => item?.id !== nextPreset.id);
        this.state.strategyPresets = this.mergeStrategyPresets([nextPreset, ...remaining]);
        this.markDirty('presets');
        this.save(true);

        return {
            preset: this.getStrategyPresetById(nextPreset.id),
            replaced: Boolean(existing)
        };
    },

    deleteStrategyPreset(id) {
        const before = (this.state.strategyPresets || []).length;
        this.state.strategyPresets = (this.state.strategyPresets || []).filter((item) => item?.id !== id);
        const removed = before - this.state.strategyPresets.length;
        if (removed > 0) {
            this.markDirty('presets');
            this.save(true);
        }
        return removed > 0;
    },

    setStrategyPrefs(scope, request) {
        if (!['generator', 'ai', 'backtest'].includes(scope)) return;
        this.state.strategyPrefs[scope] = {
            ...this.state.strategyPrefs[scope],
            ...(request || {}),
            params: {
                ...(this.state.strategyPrefs[scope]?.params || {}),
                ...(request?.params || {})
            },
            filters: {
                ...(this.state.strategyPrefs[scope]?.filters || {}),
                ...(request?.filters || {})
            }
        };
        this.markDirty('settings');
    },

    setAlertPrefs(next) {
        this.state.alertPrefs = this.mergeAlertPrefs({
            ...(this.state.alertPrefs || {}),
            ...(next || {})
        });
        this.markDirty('alerts');
        this.save(true);
        this.app?.renderSettingsPanel?.();
    },

    setApp(app) {
        this.app = app;
    },

    setSyncControlsState({ running = false, cancelable = false } = {}) {
        if (typeof document === 'undefined') return;

        const syncBtn = $('#syncDataBtn');
        const refreshBtn = $('#refreshDataBtn');
        const cancelBtn = $('#cancelSyncBtn');

        if (syncBtn) syncBtn.disabled = running;
        if (refreshBtn) refreshBtn.disabled = running;
        if (cancelBtn) {
            cancelBtn.disabled = !running || !cancelable;
            cancelBtn.style.display = running ? 'inline-flex' : 'none';
        }
    },

    createAbortError(message = 'Sync aborted') {
        const err = new Error(message);
        err.name = 'AbortError';
        return err;
    },

    isActiveSyncRun(runId) {
        if (!runId) return true;
        return runId === this._activeSyncRunId;
    },

    ensureActiveSyncRun(runId) {
        if (!this.isActiveSyncRun(runId)) {
            throw this.createAbortError('Sync aborted');
        }
        return true;
    },

    abortSyncInFlight({ force = false } = {}) {
        if (!this.syncAbortController) return false;
        if (!force && !this.syncCancelable) return false;
        if (this.syncAbortController.signal.aborted) return false;
        this.syncAbortController.abort();
        return true;
    },

    isAbortError(err) {
        if (!err) return false;
        if (err.name === 'AbortError') return true;
        return String(err.message || '') === 'Sync aborted';
    },

    stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            const items = value.map((item) => {
                const serialized = this.stableStringify(item);
                return serialized === undefined ? 'null' : serialized;
            });
            return `[${items.join(',')}]`;
        }

        const keys = Object.keys(value).sort();
        const entries = [];
        keys.forEach((key) => {
            const next = value[key];
            if (next === undefined || typeof next === 'function' || typeof next === 'symbol') return;
            const serialized = this.stableStringify(next);
            if (serialized === undefined) return;
            entries.push(`${JSON.stringify(key)}:${serialized}`);
        });
        return `{${entries.join(',')}}`;
    },

    cancelActiveSync() {
        return this.abortSyncInFlight({ force: false });
    }
};
