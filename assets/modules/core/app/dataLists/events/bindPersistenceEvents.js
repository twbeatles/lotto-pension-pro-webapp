export const appDataListBindPersistenceEventMethods = {
    bindPersistenceEvents() {
        const flushSave = () => {
            this.data.save(true);
        };
        window.addEventListener('pagehide', flushSave);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushSave();
            }
        });
    }
};