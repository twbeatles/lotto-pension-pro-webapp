import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { StrategyEngine } from '../../assets/modules/core/StrategyEngine.js';

import { assertTicketShape, buildSmokeRequest, normalizeStats } from './helpers/common.mjs';
import {
    runBacktestSmoke,
    runBackupSmoke,
    runCampaignCascadeRegression,
    runCampaignEmptySaveRegression,
    runCampaignLimitRegression,
    runCheckTargetDrawRegression,
    runDataListPaginationRegression,
    runDataListDomRegression,
    runDrawNormalizationRegression,
    runImportAlertOptionRegression,
    runLatestWinPlaceholderRegression,
    runLocalFontPathRegression,
    runNotificationPermissionRegression,
    runPersistenceFlushRegression,
    runPostImportRefreshRegression,
    runProxyPolicyRegression,
    runAutoSyncFallbackRegression,
    runQrScanReentryGuardRegression,
    runQrValidationRegression,
    runRequestNumbersRegression,
    runRuntimeAssetLocalizationRegression,
    runServiceWorkerCoreDataPrecacheRegression,
    runServiceWorkerReloadPolicyRegression,
    runStoredListNormalizationRegression,
    runStrategyPresetCrudRegression,
    runStrictFilterRegression,
    runSyncGuardRegression,
    runSyncLatestWinRefreshRegression,
    runTicketDedupeRegression,
    runWheelFixedNumbersRegression
} from './cases/regressions.mjs';

async function main() {
    const dataPath = resolve(process.cwd(), 'data', 'winning_stats.json');
    const raw = JSON.parse(await readFile(dataPath, 'utf8'));
    const stats = normalizeStats(raw);
    assert.ok(stats.length > 100, 'winning_stats.json must contain enough draws');

    const request = buildSmokeRequest();
    const engine = new StrategyEngine(stats.slice(0, -1));

    const generated = engine.generateMultipleSets(3, request, { sourceData: stats.slice(-120) });
    assertTicketShape(generated, 3);

    const recommended = engine.recommendFromSimulation(request, {
        sourceData: stats.slice(-200),
        setCount: 3
    });
    assertTicketShape(recommended.sets, 3);

    const backtest = runBacktestSmoke(stats);
    runBackupSmoke(stats);
    runStrictFilterRegression(stats.slice(-180));
    runWheelFixedNumbersRegression(stats.slice(-180));
    runDrawNormalizationRegression();
    runCampaignLimitRegression();
    runCampaignCascadeRegression();
    runQrValidationRegression();
    runTicketDedupeRegression();
    runCheckTargetDrawRegression();
    runStoredListNormalizationRegression();
    runLatestWinPlaceholderRegression();
    runStrategyPresetCrudRegression();
    await runSyncGuardRegression();
    await runRequestNumbersRegression();
    await runSyncLatestWinRefreshRegression();
    await runImportAlertOptionRegression();
    await runCampaignEmptySaveRegression();
    await runQrScanReentryGuardRegression();
    await runPostImportRefreshRegression();
    await runRuntimeAssetLocalizationRegression();
    await runAutoSyncFallbackRegression();
    runPersistenceFlushRegression();
    await runNotificationPermissionRegression();
    runDataListPaginationRegression();
    runDataListDomRegression();
    runProxyPolicyRegression();
    await runServiceWorkerReloadPolicyRegression();
    await runServiceWorkerCoreDataPrecacheRegression();
    await runLocalFontPathRegression();

    console.log(`[PASS] generate: ${generated.length} sets`);
    console.log(`[PASS] recommend: ${recommended.sets.length} sets`);
    console.log(`[PASS] backtest-smoke: tickets=${backtest.tickets}, wins=${backtest.wins}, prize=${backtest.totalPrize}`);
    console.log('[PASS] backup-v3 schema');
    console.log('[PASS] strict-filter regression');
    console.log('[PASS] wheel-fixed regression');
    console.log('[PASS] draw-normalization regression');
    console.log('[PASS] campaign-limit regression');
    console.log('[PASS] campaign-cascade regression');
    console.log('[PASS] qr-validation regression');
    console.log('[PASS] ticket-dedupe regression');
    console.log('[PASS] check-target-draw regression');
    console.log('[PASS] stored-list-normalization regression');
    console.log('[PASS] latest-win-placeholder regression');
    console.log('[PASS] strategy-preset-crud regression');
    console.log('[PASS] sync-guard regression');
    console.log('[PASS] requestNumbers replace regression');
    console.log('[PASS] sync-latest-win refresh regression');
    console.log('[PASS] import-alert-options regression');
    console.log('[PASS] campaign-empty-save regression');
    console.log('[PASS] qr-reentry-guard regression');
    console.log('[PASS] post-import-refresh regression');
    console.log('[PASS] runtime-asset-localization regression');
    console.log('[PASS] auto-sync fallback regression');
    console.log('[PASS] persistence-flush regression');
    console.log('[PASS] notification-permission regression');
    console.log('[PASS] data-list pagination regression');
    console.log('[PASS] data-list DOM regression');
    console.log('[PASS] proxy-policy regression');
    console.log('[PASS] service-worker reload policy regression');
    console.log('[PASS] service-worker core data precache regression');
    console.log('[PASS] local font path regression');
    console.log('[DONE] smoke checks passed');
}

main().catch((err) => {
    console.error('[FAIL] smoke check failed');
    console.error(err);
    process.exitCode = 1;
});
