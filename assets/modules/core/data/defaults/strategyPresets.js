export const dataDefaultsStrategyPresetsMethods = {
    mergeStrategyPresets(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const byId = new Map();
        const byScopeName = new Set();

        list.forEach((item, index) => {
            if (!item || typeof item !== 'object') return;
            const scope = typeof item.scope === 'string' ? item.scope.trim() : '';
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            const request =
                item.request && typeof item.request === 'object'
                    ? item.request
                    : item.strategyRequest && typeof item.strategyRequest === 'object'
                      ? item.strategyRequest
                      : null;
            if (!scope || !name || !request) return;
            if (!this.isStrategyScope(scope)) return;

            const normalizedRequest = this.normalizeStrategyPresetRequest(scope, request);
            if (!normalizedRequest) return;

            const id =
                typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `preset_${scope}_${name}_${index}`;
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
        const filtered = targetScope ? list.filter((item) => item.scope === targetScope) : list;
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
        const normalizedName = String(name || '')
            .trim()
            .slice(0, 80);
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
    }
};