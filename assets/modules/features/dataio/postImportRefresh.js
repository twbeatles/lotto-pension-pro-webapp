export async function runPostImportRefresh({ data, app } = {}) {
    if (!data || !app) return;
    await data.fetchWinningStats({ notifyTicketSettle: false });
    app.updateLatestWin?.();
    await app.refreshCurrentRoute?.();
    app.renderDataLists?.();
}
