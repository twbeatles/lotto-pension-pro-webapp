export const dataDefaultsDirtyMethods = {
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
    }
};