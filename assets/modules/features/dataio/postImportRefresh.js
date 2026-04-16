export async function runPostImportRefresh({ data, app } = {}) {
    if (!data || !app) return;
    const loaded = await data.fetchWinningStats({ notifyTicketSettle: false });
    const availability = String(data.dataHealth?.availability || 'none');
    if (loaded && availability !== 'none') {
        data.markLocalRestoreSuccess?.({
            drawNo: data.state.winningStats?.[0]?.draw_no || 0
        });
    } else {
        data.markLocalRestoreFailure?.(
            data.dataHealth?.message || '백업 복원 후 당첨 데이터를 다시 구성하지 못했습니다.'
        );
    }
    app.updateLatestWin?.();
    await app.refreshCurrentRoute?.();
    app.renderDataLists?.();
}
