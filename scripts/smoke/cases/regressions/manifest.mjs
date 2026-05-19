const regressionExecutionPlan = [
    {
        name: 'runStrictFilterRegression',
        label: 'strict-filter regression',
        argKey: 'stats180'
    },
    {
        name: 'runGenerateMultipleSetsMaxCountRegression',
        label: 'generateMultipleSets maxCount regression',
        argKey: 'stats180'
    },
    {
        name: 'runWheelFixedNumbersRegression',
        label: 'wheel-fixed regression',
        argKey: 'stats180'
    },
    {
        name: 'runAdaptiveRecommendationDiagnosticsRegression',
        label: 'adaptive recommendation diagnostics regression',
        argKey: 'stats180'
    },
    {
        name: 'runStrategyWorkerFinalTimeoutTerminatesRegression',
        label: 'strategy worker final-timeout termination regression',
        awaited: true
    },
    {
        name: 'runDrawNormalizationRegression',
        label: 'draw-normalization regression'
    },
    {
        name: 'runFacadeExportParityRegression',
        label: 'facade export parity regression'
    },
    { name: 'runCampaignLimitRegression', label: 'campaign-limit regression' },
    {
        name: 'runCampaignCascadeRegression',
        label: 'campaign-cascade regression'
    },
    {
        name: 'runGeneratorStrategySelectionRegression',
        label: 'generator strategy-selection regression',
        awaited: true
    },
    {
        name: 'runGeneratorSetCountClampRegression',
        label: 'generator set-count clamp regression',
        awaited: true
    },
    {
        name: 'runCampaignDerivedSeedRegression',
        label: 'campaign derived-seed regression',
        argKey: 'stats180'
    },
    {
        name: 'runNoSeedRuntimeEntropyRegression',
        label: 'no-seed runtime entropy regression',
        argKey: 'stats180'
    },
    { name: 'runQrValidationRegression', label: 'qr-validation regression' },
    { name: 'runTicketDedupeRegression', label: 'ticket-dedupe regression' },
    {
        name: 'runTicketQuantityGroupingRegression',
        label: 'ticket-quantity grouping regression'
    },
    {
        name: 'runImmediateTicketSettlementRegression',
        label: 'immediate ticket settlement regression'
    },
    {
        name: 'runTicketReconcileRegression',
        label: 'ticket-reconcile regression',
        awaited: true
    },
    {
        name: 'runCampaignResetAutofillRecoveryRegression',
        label: 'campaign reset autofill recovery regression'
    },
    {
        name: 'runOrphanCampaignAutoCleanupRegression',
        label: 'orphan-campaign auto-cleanup regression'
    },
    {
        name: 'runLoadOrphanCampaignMigrationRegression',
        label: 'load orphan-campaign migration regression'
    },
    {
        name: 'runCheckTargetDrawRegression',
        label: 'check-target-draw regression'
    },
    {
        name: 'runStoredListNormalizationRegression',
        label: 'stored-list-normalization regression'
    },
    {
        name: 'runImportStoredListStrictNormalizationRegression',
        label: 'import stored-list strict normalization regression'
    },
    {
        name: 'runLocalUpdatesFutureGuardRegression',
        label: 'future local-updates guard regression'
    },
    {
        name: 'runGeneratedTicketProvenanceRegression',
        label: 'generated ticket provenance regression'
    },
    {
        name: 'runHistoryActualLogRegression',
        label: 'history actual-log regression',
        awaited: true
    },
    {
        name: 'runClearLocalUpdatesReconcileRegression',
        label: 'clear-local-updates reconcile regression',
        awaited: true
    },
    {
        name: 'runTargetDrawAutofillRegression',
        label: 'target-draw autofill regression'
    },
    {
        name: 'runLatestWinPlaceholderRegression',
        label: 'latest-win-placeholder regression'
    },
    {
        name: 'runStrategyPresetCrudRegression',
        label: 'strategy-preset-crud regression'
    },
    {
        name: 'runSyncGuardRegression',
        label: 'sync-guard regression',
        awaited: true
    },
    {
        name: 'runRequestNumbersRegression',
        label: 'requestNumbers replace regression',
        awaited: true
    },
    {
        name: 'runRefreshCurrentRouteStaleRegression',
        label: 'refreshCurrentRoute stale regression',
        awaited: true
    },
    {
        name: 'runSyncLatestWinRefreshRegression',
        label: 'sync-latest-win refresh regression',
        awaited: true
    },
    {
        name: 'runWinningStatsLoadClassificationRegression',
        label: 'winning-stats load classification regression',
        awaited: true
    },
    {
        name: 'runUnexpectedStaticHoleClassificationRegression',
        label: 'unexpected static-hole classification regression'
    },
    {
        name: 'runExpectedMissingDrawAllowanceRegression',
        label: 'expected missing-draw allowance regression'
    },
    {
        name: 'runMergedLocalUpdatesGapClassificationRegression',
        label: 'merged local-updates gap classification regression'
    },
    {
        name: 'runPartialWinningStatsRecoveryRegression',
        label: 'partial winning-stats recovery regression',
        awaited: true
    },
    {
        name: 'runLocalRestoreSyncMetaRegression',
        label: 'local-restore sync-meta regression',
        awaited: true
    },
    { name: 'runRouteDataGateRegression', label: 'route data-gate regression' },
    {
        name: 'runSyncInvalidPayloadRegression',
        label: 'sync invalid payload regression',
        awaited: true
    },
    {
        name: 'runSyncPayloadDrawIntegerGuardRegression',
        label: 'sync payload draw integer guard regression'
    },
    {
        name: 'runMalformedDrawDateRejectedRegression',
        label: 'malformed draw date rejection regression'
    },
    {
        name: 'runWinningStatsPreserveExistingOnStaticFailureRegression',
        label: 'winning-stats transient failure preserve regression',
        awaited: true
    },
    {
        name: 'runStaticDataFreshnessBudgetRegression',
        label: 'static data freshness budget regression',
        awaited: true
    },
    {
        name: 'runBuiltInSyncProviderRegression',
        label: 'built-in sync provider regression'
    },
    {
        name: 'runPension720NormalizationRegression',
        label: 'pension720 normalization regression'
    },
    {
        name: 'runPension720RecommendationRegression',
        label: 'pension720 recommendation regression'
    },
    {
        name: 'runPension720AdvancedRecommendationRegression',
        label: 'pension720 advanced recommendation regression'
    },
    {
        name: 'runPension720TicketDedupeRegression',
        label: 'pension720 ticket dedupe regression'
    },
    {
        name: 'runPension720CampaignRegression',
        label: 'pension720 campaign regression'
    },
    {
        name: 'runPension720TicketCapRegression',
        label: 'pension720 ticket cap regression'
    },
    {
        name: 'runPension720BackupV5Regression',
        label: 'pension720 backup-v5 regression'
    },
    {
        name: 'runPension720BackupFixtureRegression',
        label: 'pension720 backup-v4 fixture regression',
        awaited: true
    },
    {
        name: 'runPension720FreshnessComparisonRegression',
        label: 'pension720 online freshness comparison regression'
    },
    {
        name: 'runPension720LatestCheckRegression',
        label: 'pension720 latest-check regression'
    },
    {
        name: 'runPension720CsvFormulaEscapeRegression',
        label: 'pension720 CSV formula escape regression'
    },
    {
        name: 'runPension720UiContractRegression',
        label: 'pension720 expanded UI contract regression',
        awaited: true
    },
    {
        name: 'runPension720StaticDataRegression',
        label: 'pension720 static data regression',
        awaited: true
    },
    {
        name: 'runPension720PrecacheRegression',
        label: 'pension720 precache regression',
        awaited: true
    },
    {
        name: 'runImportAlertOptionRegression',
        label: 'import-alert-options regression',
        awaited: true
    },
    {
        name: 'runImportPreviewAndOverwriteBackupRegression',
        label: 'import preview and overwrite backup regression',
        awaited: true
    },
    {
        name: 'runImportOrphanCampaignCleanupRegression',
        label: 'import orphan-campaign cleanup regression',
        awaited: true
    },
    {
        name: 'runCleanupStoredRecordsRegression',
        label: 'stored-record cleanup regression'
    },
    {
        name: 'runImportSafetyLimitsRegression',
        label: 'import safety limits regression',
        awaited: true
    },
    {
        name: 'runCampaignEmptySaveRegression',
        label: 'campaign-empty-save regression',
        awaited: true
    },
    {
        name: 'runQrScanReentryGuardRegression',
        label: 'qr-reentry-guard regression',
        awaited: true
    },
    {
        name: 'runQrRouteCleanupRegression',
        label: 'qr route cleanup regression',
        awaited: true
    },
    {
        name: 'runPostImportRefreshRegression',
        label: 'post-import-refresh regression',
        awaited: true
    },
    {
        name: 'runPostImportRefreshFailureRegression',
        label: 'post-import-refresh failure regression',
        awaited: true
    },
    {
        name: 'runRuntimeAssetLocalizationRegression',
        label: 'runtime-asset-localization regression',
        awaited: true
    },
    {
        name: 'runAutoSyncFallbackRegression',
        label: 'auto-sync fallback regression',
        awaited: true
    },
    {
        name: 'runOfflineProbeRecoveryRegression',
        label: 'offline-probe recovery regression',
        awaited: true
    },
    {
        name: 'runBackgroundAutoSyncRegression',
        label: 'background auto-sync regression',
        awaited: true
    },
    {
        name: 'runPersistenceFlushRegression',
        label: 'persistence-flush regression'
    },
    {
        name: 'runStorageSummaryByteAccountingRegression',
        label: 'storage summary byte accounting regression'
    },
    {
        name: 'runStorageDirtyRetainedOnFailureRegression',
        label: 'storage dirty-retained-on-failure regression'
    },
    {
        name: 'runDestructiveBackupAbortRegression',
        label: 'destructive backup abort regression',
        awaited: true
    },
    {
        name: 'runPension720OfficialCacheRegression',
        label: 'pension720 official-cache regression',
        awaited: true
    },
    {
        name: 'runAutoSyncAvailabilityRegression',
        label: 'auto-sync availability regression'
    },
    {
        name: 'runTemporaryResultsSessionRegression',
        label: 'temporary results session regression'
    },
    {
        name: 'runDomSelectorContractRegression',
        label: 'DOM selector contract regression',
        awaited: true
    },
    {
        name: 'runNotificationPermissionRegression',
        label: 'notification-permission regression',
        awaited: true
    },
    {
        name: 'runRegressionBarrelExportParityRegression',
        label: 'regression barrel export parity regression',
        awaited: true
    },
    {
        name: 'runDataListPaginationRegression',
        label: 'data-list pagination regression'
    },
    { name: 'runDataListDomRegression', label: 'data-list DOM regression' },
    {
        name: 'runLiveRegionAccessibilityRegression',
        label: 'live-region accessibility regression',
        awaited: true
    },
    {
        name: 'runCheckTargetCardAttributeEscapingRegression',
        label: 'check target-card attribute escaping regression'
    },
    { name: 'runProxyPolicyRegression', label: 'proxy-policy regression' },
    {
        name: 'runProxyChangeAbortRegression',
        label: 'proxy-change abort regression',
        awaited: true
    },
    {
        name: 'runProxyInputChangeAbortRegression',
        label: 'proxy input change abort regression'
    },
    {
        name: 'runServiceWorkerReloadPolicyRegression',
        label: 'service-worker reload policy regression',
        awaited: true
    },
    {
        name: 'runServiceWorkerCoreDataPrecacheRegression',
        label: 'service-worker core data precache regression',
        awaited: true
    },
    {
        name: 'runWebManifestInstallabilityRegression',
        label: 'web manifest installability regression',
        awaited: true
    },
    {
        name: 'runPwaUpdateSettingsUiRegression',
        label: 'PWA update settings UI regression',
        awaited: true
    },
    {
        name: 'runPwaCacheHealthRegression',
        label: 'PWA cache health regression',
        awaited: true
    },
    {
        name: 'runServiceWorkerManifestParityRegression',
        label: 'service-worker manifest parity regression',
        awaited: true
    },
    {
        name: 'runServiceWorkerPrecacheReachabilityRegression',
        label: 'service-worker precache reachability regression',
        awaited: true
    },
    {
        name: 'runHiddenAttributeStyleRegression',
        label: 'hidden-attribute style regression',
        awaited: true
    },
    {
        name: 'runLocalFontPathRegression',
        label: 'local font path regression',
        awaited: true
    },
    {
        name: 'runInnerHtmlAllowlistRegression',
        label: 'innerHTML allowlist regression',
        awaited: true
    },
    {
        name: 'runLatestWinDateEscapingRegression',
        label: 'latest win date escaping regression'
    },
    {
        name: 'runRecommendationCopyRegression',
        label: 'recommendation copy regression',
        awaited: true
    },
    {
        name: 'runRecommendationRuntimePolicyRegression',
        label: 'recommendation runtime policy regression',
        awaited: true
    }
];

const regressionBarrelExportNames = [
    'runBacktestSmoke',
    'runBackupSmoke',
    ...regressionExecutionPlan.map(({ name }) => name)
];

export { regressionBarrelExportNames, regressionExecutionPlan };
