export async function runPostImportRefresh({ data, app } = {}) {
    if (!data || !app) return;
    await data.fetchWinningStats({ notifyTicketSettle: false });
    data.markLocalRestoreSuccess?.({
        drawNo: data.state.winningStats?.[0]?.draw_no || 0
    });
    app.updateLatestWin?.();
    await app.refreshCurrentRoute?.();
    app.renderDataLists?.();
}
