export const appPwaInstallCacheHealthMethods = {
    async _refreshPwaCacheHealth() {
        if (typeof fetch !== 'function') return null;
        try {
            const response = await fetch('./__cache-health.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            this._pwaCacheHealth = {
                available: true,
                ok: payload?.ok !== false,
                cacheVersion: String(payload?.cacheVersion || ''),
                checkedAt: String(payload?.checkedAt || ''),
                failures: Array.isArray(payload?.failures) ? payload.failures : []
            };
        } catch (error) {
            this._pwaCacheHealth = {
                available: false,
                ok: false,
                cacheVersion: '',
                checkedAt: '',
                failures: [],
                message: String(error?.message || error || '')
            };
        }
        this.renderPwaCacheHealth?.();
        return this._pwaCacheHealth;
    },

    renderPwaCacheHealth() {
        const badge = document.getElementById('pwaCacheBadge');
        const note = document.getElementById('pwaCacheNote');
        if (!badge && !note) return;

        const health = this._pwaCacheHealth;
        let state = { label: 'pending', code: 'prompt' };
        let message = 'Cache health will be checked after the service worker is active.';
        if (health?.available) {
            const count = health.failures?.length || 0;
            state = count ? { label: `warning ${count}`, code: 'warning' } : { label: 'ok', code: 'success' };
            message = count
                ? `precache failed for ${count} asset(s). Check for an update, then review again.`
                : `precache completed${health.cacheVersion ? ` (${health.cacheVersion})` : ''}`;
        } else if (health) {
            state = { label: 'not ready', code: 'prompt' };
            message = 'Cache health is not readable yet. This can be normal immediately after install.';
        }

        if (badge) {
            badge.textContent = state.label;
            badge.className = `badge ${this.getStatusBadgeClass?.(state.code)}`;
        }
        if (note) note.textContent = message;
    }
};